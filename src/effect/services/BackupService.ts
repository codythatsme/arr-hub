import { randomUUID } from "node:crypto"
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"

import Database from "better-sqlite3"
import { Context, Effect, Layer } from "effect"

import { BackupError } from "#/effect/errors"

const DEFAULT_DATABASE_PATH = "data/arr-hub.db"
const DEFAULT_BACKUP_DIR_NAME = "backups"

export interface BackupResult {
  readonly id: string
  readonly filename: string
  readonly createdAt: Date
  readonly sourcePath: string
  readonly backupPath: string
  readonly manifestPath: string
  readonly sizeBytes: number
}

export interface BackupSummary {
  readonly id: string
  readonly filename: string
  readonly createdAt: Date
  readonly sourcePath: string
  readonly backupPath: string
  readonly manifestPath: string | null
  readonly sizeBytes: number
  readonly reason: "scheduled" | "pre_restore"
}

export interface BackupFile {
  readonly id: string
  readonly filename: string
  readonly path: string
  readonly createdAt: Date
  readonly sizeBytes: number
}

export interface RestoreResult {
  readonly restoredAt: Date
  readonly sourcePath: string
  readonly restoredFrom: string
  readonly safetyBackup: BackupResult
}

export class BackupService extends Context.Tag("@arr-hub/BackupService")<
  BackupService,
  {
    readonly createDatabaseBackup: () => Effect.Effect<BackupResult, BackupError>
    readonly listDatabaseBackups: () => Effect.Effect<ReadonlyArray<BackupSummary>, BackupError>
    readonly getDatabaseBackupFile: (id: string) => Effect.Effect<BackupFile, BackupError>
    readonly restoreDatabaseBackup: (id: string) => Effect.Effect<RestoreResult, BackupError>
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

function backupFilename(id: string) {
  return `arr-hub-${id}.db`
}

function manifestFilename(id: string) {
  return `arr-hub-${id}.json`
}

function parseBackupId(filename: string) {
  if (!filename.startsWith("arr-hub-") || !filename.endsWith(".db")) return null
  const id = filename.slice("arr-hub-".length, -".db".length)
  return id.length > 0 ? id : null
}

function isSafeBackupId(id: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : String(error)
}

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { readonly code?: unknown }).code)
    : null
}

interface ManifestFile {
  readonly createdAt?: unknown
  readonly sourcePath?: unknown
  readonly backupPath?: unknown
  readonly sizeBytes?: unknown
  readonly reason?: unknown
}

function manifestString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

function manifestNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function manifestReason(value: unknown): BackupSummary["reason"] {
  return value === "pre_restore" ? "pre_restore" : "scheduled"
}

function dateFromManifest(value: unknown, fallback: Date) {
  const raw = manifestString(value)
  if (!raw) return fallback
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

async function readManifest(manifestPath: string): Promise<ManifestFile | null> {
  try {
    return JSON.parse(await readFile(manifestPath, "utf8")) as ManifestFile
  } catch (error) {
    if (errorCode(error) === "ENOENT") return null
    return null
  }
}

async function summarizeBackup(
  backupDirectory: string,
  databasePath: string,
  filename: string,
): Promise<BackupSummary | null> {
  const id = parseBackupId(filename)
  if (!id) return null

  const backupPath = path.join(backupDirectory, filename)
  const backupStat = await stat(backupPath)
  if (!backupStat.isFile()) return null
  const candidateManifestPath = path.join(backupDirectory, manifestFilename(id))
  const manifest = await readManifest(candidateManifestPath)
  const createdAt = dateFromManifest(manifest?.createdAt, backupStat.mtime)

  return {
    id,
    filename,
    createdAt,
    sourcePath: manifestString(manifest?.sourcePath) ?? databasePath,
    backupPath,
    manifestPath: manifest ? candidateManifestPath : null,
    sizeBytes: manifestNumber(manifest?.sizeBytes) ?? backupStat.size,
    reason: manifestReason(manifest?.reason),
  }
}

async function listBackupSummaries() {
  const databasePath = resolveDatabasePath()
  const backupDirectory = resolveBackupDirectory(databasePath)

  let entries: ReadonlyArray<string>
  try {
    entries = await readdir(backupDirectory)
  } catch (error) {
    if (errorCode(error) === "ENOENT") return []
    throw error
  }

  const summaries = (
    await Promise.all(
      entries.map((filename) => summarizeBackup(backupDirectory, databasePath, filename)),
    )
  ).filter((summary): summary is BackupSummary => summary !== null)
  return summaries.toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

async function findBackupSummary(id: string) {
  if (!isSafeBackupId(id)) {
    throw new BackupError({
      reason: "backup_not_found",
      message: `database backup ${id} was not found`,
    })
  }

  const backups = await listBackupSummaries()
  const backup = backups.find((item) => item.id === id)
  if (!backup) {
    throw new BackupError({
      reason: "backup_not_found",
      message: `database backup ${id} was not found`,
    })
  }
  return backup
}

async function createBackup(reason: BackupSummary["reason"]): Promise<BackupResult> {
  const sourcePath = resolveDatabasePath()
  const backupDirectory = resolveBackupDirectory(sourcePath)
  const createdAt = new Date()
  const reasonSegment = reason === "pre_restore" ? "pre-restore-" : ""
  const backupId = `${timestampForFilename(createdAt)}-${reasonSegment}${randomUUID().slice(0, 8)}`
  const filename = backupFilename(backupId)
  const backupPath = path.join(backupDirectory, filename)
  const manifestPath = path.join(backupDirectory, manifestFilename(backupId))

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
        id: backupId,
        filename,
        createdAt: createdAt.toISOString(),
        sourcePath,
        backupPath,
        sizeBytes: backupStat.size,
        reason,
      },
      null,
      2,
    )}\n`,
    "utf8",
  )

  return {
    id: backupId,
    filename,
    createdAt,
    sourcePath,
    backupPath,
    manifestPath,
    sizeBytes: backupStat.size,
  }
}

export const BackupServiceLive = Layer.succeed(BackupService, {
  createDatabaseBackup: () =>
    Effect.tryPromise({
      try: () => createBackup("scheduled"),
      catch: (error) =>
        new BackupError({
          reason: errorCode(error) === "ENOENT" ? "database_missing" : "backup_failed",
          message: `database backup failed: ${errorMessage(error)}`,
        }),
    }),

  listDatabaseBackups: () =>
    Effect.tryPromise({
      try: () => listBackupSummaries(),
      catch: (error) =>
        new BackupError({
          reason: "backup_failed",
          message: `database backup listing failed: ${errorMessage(error)}`,
        }),
    }),

  getDatabaseBackupFile: (id) =>
    Effect.tryPromise({
      try: async () => {
        const backup = await findBackupSummary(id)
        return {
          id: backup.id,
          filename: backup.filename,
          path: backup.backupPath,
          createdAt: backup.createdAt,
          sizeBytes: backup.sizeBytes,
        }
      },
      catch: (error) =>
        error instanceof BackupError
          ? error
          : new BackupError({
              reason: "backup_failed",
              message: `database backup lookup failed: ${errorMessage(error)}`,
            }),
    }),

  restoreDatabaseBackup: (id) =>
    Effect.tryPromise({
      try: async () => {
        const backup = await findBackupSummary(id)
        const sourcePath = resolveDatabasePath()
        await stat(sourcePath)
        const safetyBackup = await createBackup("pre_restore")

        const backupDatabase = new Database(backup.backupPath, {
          readonly: true,
          fileMustExist: true,
        })
        try {
          const quickCheck = backupDatabase.prepare("PRAGMA quick_check").pluck().get()
          if (quickCheck !== "ok") {
            throw new Error(`backup integrity check failed: ${String(quickCheck)}`)
          }
          await backupDatabase.backup(sourcePath)
        } finally {
          backupDatabase.close()
        }

        return {
          restoredAt: new Date(),
          sourcePath,
          restoredFrom: backup.backupPath,
          safetyBackup,
        }
      },
      catch: (error) =>
        error instanceof BackupError
          ? error
          : new BackupError({
              reason: errorCode(error) === "ENOENT" ? "database_missing" : "restore_failed",
              message: `database restore failed: ${errorMessage(error)}`,
            }),
    }),
})
