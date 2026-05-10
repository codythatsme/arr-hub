import { randomUUID } from "node:crypto"
import { mkdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"

import Database from "better-sqlite3"
import { Context, Effect, Layer } from "effect"

import { BackupError } from "#/effect/errors"

const DEFAULT_DATABASE_PATH = "data/arr-hub.db"
const DEFAULT_BACKUP_DIR_NAME = "backups"

export interface BackupResult {
  readonly createdAt: Date
  readonly sourcePath: string
  readonly backupPath: string
  readonly manifestPath: string
  readonly sizeBytes: number
}

export class BackupService extends Context.Tag("@arr-hub/BackupService")<
  BackupService,
  {
    readonly createDatabaseBackup: () => Effect.Effect<BackupResult, BackupError>
  }
>() {}

function resolveDatabasePath() {
  return path.resolve(process.env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH)
}

function resolveBackupDirectory(databasePath: string) {
  return path.resolve(
    process.env.ARR_HUB_BACKUP_PATH ??
      path.join(path.dirname(databasePath), DEFAULT_BACKUP_DIR_NAME),
  )
}

function timestampForFilename(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-")
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : String(error)
}

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { readonly code?: unknown }).code)
    : null
}

export const BackupServiceLive = Layer.succeed(BackupService, {
  createDatabaseBackup: () =>
    Effect.tryPromise({
      try: async () => {
        const sourcePath = resolveDatabasePath()
        const backupDirectory = resolveBackupDirectory(sourcePath)
        const createdAt = new Date()
        const backupId = `${timestampForFilename(createdAt)}-${randomUUID().slice(0, 8)}`
        const backupPath = path.join(backupDirectory, `arr-hub-${backupId}.db`)
        const manifestPath = path.join(backupDirectory, `arr-hub-${backupId}.json`)

        await mkdir(backupDirectory, { recursive: true })
        await stat(sourcePath)

        const database = new Database(sourcePath, { readonly: true, fileMustExist: true })
        try {
          await database.backup(backupPath)
        } finally {
          database.close()
        }

        const backupStat = await stat(backupPath)
        await writeFile(
          manifestPath,
          `${JSON.stringify(
            {
              createdAt: createdAt.toISOString(),
              sourcePath,
              backupPath,
              sizeBytes: backupStat.size,
            },
            null,
            2,
          )}\n`,
          "utf8",
        )

        return {
          createdAt,
          sourcePath,
          backupPath,
          manifestPath,
          sizeBytes: backupStat.size,
        }
      },
      catch: (error) =>
        new BackupError({
          reason: errorCode(error) === "ENOENT" ? "database_missing" : "backup_failed",
          message: `database backup failed: ${errorMessage(error)}`,
        }),
    }),
})
