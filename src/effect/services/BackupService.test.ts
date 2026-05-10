import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import Database from "better-sqlite3"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { BackupService, BackupServiceLive } from "./BackupService"

function restoreEnv(key: "DATABASE_PATH" | "ARR_HUB_BACKUP_PATH", value: string | undefined) {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

describe("BackupService", () => {
  it("creates an online SQLite backup and manifest in the configured backup path", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "arr-hub-backup-"))
    const previousDatabasePath = process.env.DATABASE_PATH
    const previousBackupPath = process.env.ARR_HUB_BACKUP_PATH

    try {
      const databasePath = path.join(root, "arr-hub.db")
      const backupPath = path.join(root, "backups")
      const database = new Database(databasePath)
      try {
        database.exec("CREATE TABLE movies (id INTEGER PRIMARY KEY, title TEXT NOT NULL)")
        database.prepare("INSERT INTO movies (title) VALUES (?)").run("Primer")
      } finally {
        database.close()
      }

      process.env.DATABASE_PATH = databasePath
      process.env.ARR_HUB_BACKUP_PATH = backupPath

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const backups = yield* BackupService
          return yield* backups.createDatabaseBackup()
        }).pipe(Effect.provide(BackupServiceLive)),
      )

      await expect(access(result.backupPath)).resolves.toBeUndefined()
      await expect(access(result.manifestPath)).resolves.toBeUndefined()
      expect(result.id).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(result.filename).toBe(`arr-hub-${result.id}.db`)
      expect(result.sourcePath).toBe(databasePath)
      expect(path.dirname(result.backupPath)).toBe(backupPath)
      expect(result.sizeBytes).toBeGreaterThan(0)

      const backup = new Database(result.backupPath, { readonly: true, fileMustExist: true })
      try {
        expect(backup.prepare("SELECT title FROM movies").pluck().get()).toBe("Primer")
      } finally {
        backup.close()
      }

      const manifest = JSON.parse(await readFile(result.manifestPath, "utf8")) as {
        readonly sourcePath: string
        readonly backupPath: string
        readonly sizeBytes: number
      }
      const backupStat = await stat(result.backupPath)

      expect(manifest.sourcePath).toBe(databasePath)
      expect(manifest.backupPath).toBe(result.backupPath)
      expect(manifest.sizeBytes).toBe(backupStat.size)

      const listed = await Effect.runPromise(
        Effect.gen(function* () {
          const backups = yield* BackupService
          return yield* backups.listDatabaseBackups()
        }).pipe(Effect.provide(BackupServiceLive)),
      )
      const file = await Effect.runPromise(
        Effect.gen(function* () {
          const backups = yield* BackupService
          return yield* backups.getDatabaseBackupFile(result.id)
        }).pipe(Effect.provide(BackupServiceLive)),
      )

      expect(listed).toHaveLength(1)
      expect(listed[0]).toMatchObject({
        id: result.id,
        filename: result.filename,
        backupPath: result.backupPath,
        reason: "scheduled",
      })
      expect(file.path).toBe(result.backupPath)
      expect(file.filename).toBe(result.filename)
    } finally {
      restoreEnv("DATABASE_PATH", previousDatabasePath)
      restoreEnv("ARR_HUB_BACKUP_PATH", previousBackupPath)
      await rm(root, { recursive: true, force: true })
    }
  })

  it("fails with database_missing when the configured database does not exist", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "arr-hub-backup-missing-"))
    const previousDatabasePath = process.env.DATABASE_PATH
    const previousBackupPath = process.env.ARR_HUB_BACKUP_PATH

    try {
      process.env.DATABASE_PATH = path.join(root, "missing.db")
      process.env.ARR_HUB_BACKUP_PATH = path.join(root, "backups")

      const error = await Effect.runPromise(
        Effect.flip(
          Effect.gen(function* () {
            const backups = yield* BackupService
            return yield* backups.createDatabaseBackup()
          }).pipe(Effect.provide(BackupServiceLive)),
        ),
      )

      expect(error._tag).toBe("BackupError")
      expect(error.reason).toBe("database_missing")
    } finally {
      restoreEnv("DATABASE_PATH", previousDatabasePath)
      restoreEnv("ARR_HUB_BACKUP_PATH", previousBackupPath)
      await rm(root, { recursive: true, force: true })
    }
  })

  it("restores a selected backup after creating a pre-restore safety backup", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "arr-hub-backup-restore-"))
    const previousDatabasePath = process.env.DATABASE_PATH
    const previousBackupPath = process.env.ARR_HUB_BACKUP_PATH

    try {
      const databasePath = path.join(root, "arr-hub.db")
      const backupPath = path.join(root, "backups")
      const database = new Database(databasePath)
      try {
        database.exec("CREATE TABLE movies (id INTEGER PRIMARY KEY, title TEXT NOT NULL)")
        database.prepare("INSERT INTO movies (title) VALUES (?)").run("Primer")
      } finally {
        database.close()
      }

      process.env.DATABASE_PATH = databasePath
      process.env.ARR_HUB_BACKUP_PATH = backupPath

      const created = await Effect.runPromise(
        Effect.gen(function* () {
          const backups = yield* BackupService
          return yield* backups.createDatabaseBackup()
        }).pipe(Effect.provide(BackupServiceLive)),
      )

      const changed = new Database(databasePath)
      try {
        changed.prepare("UPDATE movies SET title = ? WHERE id = 1").run("Changed")
      } finally {
        changed.close()
      }

      const restored = await Effect.runPromise(
        Effect.gen(function* () {
          const backups = yield* BackupService
          return yield* backups.restoreDatabaseBackup(created.id)
        }).pipe(Effect.provide(BackupServiceLive)),
      )

      expect(restored.restoredFrom).toBe(created.backupPath)
      await expect(access(restored.safetyBackup.backupPath)).resolves.toBeUndefined()

      const restoredDatabase = new Database(databasePath, { readonly: true, fileMustExist: true })
      try {
        expect(restoredDatabase.prepare("SELECT title FROM movies").pluck().get()).toBe("Primer")
      } finally {
        restoredDatabase.close()
      }

      const safetyDatabase = new Database(restored.safetyBackup.backupPath, {
        readonly: true,
        fileMustExist: true,
      })
      try {
        expect(safetyDatabase.prepare("SELECT title FROM movies").pluck().get()).toBe("Changed")
      } finally {
        safetyDatabase.close()
      }
    } finally {
      restoreEnv("DATABASE_PATH", previousDatabasePath)
      restoreEnv("ARR_HUB_BACKUP_PATH", previousBackupPath)
      await rm(root, { recursive: true, force: true })
    }
  })

  it("rejects unsafe backup ids", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "arr-hub-backup-unsafe-"))
    const previousDatabasePath = process.env.DATABASE_PATH
    const previousBackupPath = process.env.ARR_HUB_BACKUP_PATH

    try {
      process.env.DATABASE_PATH = path.join(root, "arr-hub.db")
      process.env.ARR_HUB_BACKUP_PATH = path.join(root, "backups")

      const error = await Effect.runPromise(
        Effect.flip(
          Effect.gen(function* () {
            const backups = yield* BackupService
            return yield* backups.getDatabaseBackupFile("../arr-hub.db")
          }).pipe(Effect.provide(BackupServiceLive)),
        ),
      )

      expect(error._tag).toBe("BackupError")
      expect(error.reason).toBe("backup_not_found")
    } finally {
      restoreEnv("DATABASE_PATH", previousDatabasePath)
      restoreEnv("ARR_HUB_BACKUP_PATH", previousBackupPath)
      await rm(root, { recursive: true, force: true })
    }
  })
})
