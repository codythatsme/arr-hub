import { constants } from "node:fs"
import { access, mkdir, readFile } from "node:fs/promises"
import path from "node:path"

import Database from "better-sqlite3"

const DEFAULT_DATABASE_PATH = "data/arr-hub.db"
const DEFAULT_MIGRATION_JOURNAL_PATH = "drizzle/meta/_journal.json"
const MIGRATIONS_TABLE = "__drizzle_migrations"

export const STARTUP_REQUIRED_TABLES = [
  "users",
  "api_keys",
  "login_attempts",
  "quality_profiles",
  "quality_items",
  "custom_formats",
  "custom_format_specs",
  "custom_format_scores",
  "movies",
  "series",
  "seasons",
  "episodes",
  "settings",
  "root_folders",
  "indexer_proxies",
  "indexers",
  "indexer_definitions",
  "indexer_definition_sources",
  "indexer_stats",
  "indexer_health",
  "recent_releases",
  "indexer_applications",
  "indexer_application_mappings",
  "download_clients",
  "download_client_health",
  "download_queue",
  "download_history",
  "remote_path_mappings",
  "media_files",
  "media_servers",
  "media_server_health",
  "media_server_libraries",
  "plex_users",
  "session_history",
  "notification_channels",
  "notification_deliveries",
  "plugins",
  "release_decisions",
  "release_blocklist",
  "scheduler_config",
  "setup_state",
  "setup_log",
  "scheduler_jobs",
] as const

export const STARTUP_REQUIRED_COLUMNS = [
  { table: "users", column: "password_hash" },
  { table: "login_attempts", column: "login_key" },
  { table: "login_attempts", column: "locked_until" },
  { table: "scheduler_config", column: "job_type" },
  { table: "scheduler_jobs", column: "payload" },
  { table: "scheduler_jobs", column: "dedupe_key" },
  { table: "indexers", column: "definition_key" },
  { table: "indexers", column: "settings" },
  { table: "indexers", column: "tags" },
  { table: "indexers", column: "search_enabled" },
  { table: "indexers", column: "rss_enabled" },
  { table: "indexers", column: "config_values_encrypted" },
  { table: "download_clients", column: "settings" },
  { table: "download_queue", column: "episode_ids" },
  { table: "download_history", column: "recorded_at" },
  { table: "movies", column: "existing_revision_version" },
  { table: "movies", column: "existing_revision_real" },
  { table: "movies", column: "existing_release_group" },
  { table: "episodes", column: "existing_revision_version" },
  { table: "episodes", column: "existing_revision_real" },
  { table: "episodes", column: "existing_release_group" },
  { table: "remote_path_mappings", column: "remote_path" },
  { table: "remote_path_mappings", column: "local_path" },
  { table: "media_files", column: "media_kind" },
  { table: "media_files", column: "path" },
  { table: "media_files", column: "revision_version" },
  { table: "media_files", column: "revision_real" },
  { table: "media_files", column: "release_group" },
  { table: "media_files", column: "repack" },
  { table: "media_servers", column: "monitoring_enabled" },
  { table: "session_history", column: "platform" },
  { table: "notification_channels", column: "settings" },
  { table: "plugins", column: "manifest_json" },
  { table: "release_decisions", column: "decision" },
  { table: "release_blocklist", column: "candidate_title" },
  { table: "recent_releases", column: "release_key" },
  { table: "recent_releases", column: "last_seen_at" },
] as const

interface MigrationJournal {
  readonly entries: ReadonlyArray<{
    readonly idx: number
    readonly tag: string
    readonly when: number
  }>
}

export interface StartupCheckOptions {
  readonly databasePath?: string
  readonly migrationJournalPath?: string
}

export interface StartupCheckResult {
  readonly databasePath: string
  readonly warnings: ReadonlyArray<string>
}

export class StartupCheckError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StartupCheckError"
  }
}

function resolveDatabasePath(options: StartupCheckOptions) {
  return path.resolve(options.databasePath ?? process.env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH)
}

function resolveMigrationJournalPath(options: StartupCheckOptions) {
  return path.resolve(options.migrationJournalPath ?? DEFAULT_MIGRATION_JOURNAL_PATH)
}

function quoteIdentifier(identifier: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new StartupCheckError(`invalid SQLite identifier in startup check: ${identifier}`)
  }
  return `"${identifier}"`
}

function tableExists(database: Database.Database, tableName: string) {
  const row = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName)
  return row !== undefined
}

function columnExists(database: Database.Database, tableName: string, columnName: string) {
  const rows = database.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all() as Array<{
    readonly name: string
  }>
  return rows.some((row) => row.name === columnName)
}

async function readLatestMigration(journalPath: string) {
  const raw = await readFile(journalPath, "utf8")
  const journal = JSON.parse(raw) as MigrationJournal
  const latest = journal.entries.toSorted((a, b) => b.idx - a.idx)[0]
  if (!latest) {
    throw new StartupCheckError(`migration journal is empty: ${journalPath}`)
  }
  return latest
}

function latestAppliedMigration(database: Database.Database) {
  if (!tableExists(database, MIGRATIONS_TABLE)) return null

  const row = database
    .prepare(
      `SELECT created_at FROM ${quoteIdentifier(MIGRATIONS_TABLE)} ORDER BY created_at DESC LIMIT 1`,
    )
    .get() as { readonly created_at: number | string | null } | undefined
  if (!row?.created_at) return null

  return Number(row.created_at)
}

function validateSchemaShape(database: Database.Database) {
  const missingTables = STARTUP_REQUIRED_TABLES.filter((table) => !tableExists(database, table))
  const missingColumns = STARTUP_REQUIRED_COLUMNS.filter(
    ({ table, column }) => tableExists(database, table) && !columnExists(database, table, column),
  )

  if (missingTables.length > 0 || missingColumns.length > 0) {
    const details = [
      missingTables.length > 0 ? `missing tables: ${missingTables.join(", ")}` : null,
      missingColumns.length > 0
        ? `missing columns: ${missingColumns.map((item) => `${item.table}.${item.column}`).join(", ")}`
        : null,
    ].filter((detail) => detail !== null)

    throw new StartupCheckError(
      `database schema is incomplete (${details.join("; ")}). Run database migrations before starting ARR Hub.`,
    )
  }
}

function migrationHint(databasePath: string) {
  return [
    `Database path: ${databasePath}`,
    "For source installs, run `bun run db:migrate` or `bun run db:push` before starting.",
    "For Docker installs, ensure the container command runs `drizzle-kit migrate` and the /data volume is writable.",
  ].join("\n")
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : String(error)
}

export async function runStartupChecks(
  options: StartupCheckOptions = {},
): Promise<StartupCheckResult> {
  const databasePath = resolveDatabasePath(options)
  const journalPath = resolveMigrationJournalPath(options)
  const warnings: Array<string> = []

  await mkdir(path.dirname(databasePath), { recursive: true })
  try {
    await access(path.dirname(databasePath), constants.R_OK | constants.W_OK | constants.X_OK)
  } catch (error) {
    throw new StartupCheckError(
      `database directory is not readable and writable: ${path.dirname(databasePath)} (${errorMessage(error)}).`,
    )
  }

  const latestMigration = await readLatestMigration(journalPath)

  let database: Database.Database
  try {
    await access(databasePath, constants.R_OK | constants.W_OK)
    database = new Database(databasePath, { readonly: true, fileMustExist: true })
  } catch (error) {
    const message = errorMessage(error)
    if (message.includes("ENOENT") || message.includes("no such file")) {
      throw new StartupCheckError(`database file does not exist. ${migrationHint(databasePath)}`)
    }
    throw new StartupCheckError(
      `database file is not readable and writable: ${databasePath} (${message}).`,
    )
  }

  try {
    const appliedMigration = latestAppliedMigration(database)
    validateSchemaShape(database)

    if (appliedMigration === null) {
      warnings.push(
        "database has no Drizzle migration metadata; schema shape was validated instead.",
      )
    } else if (appliedMigration < latestMigration.when) {
      throw new StartupCheckError(
        `database migrations are behind. Latest expected migration is ${latestMigration.tag}; run migrations before starting ARR Hub.\n${migrationHint(databasePath)}`,
      )
    } else if (appliedMigration > latestMigration.when) {
      throw new StartupCheckError(
        `database was migrated by a newer ARR Hub build. Upgrade this app build or restore a compatible backup before starting.\n${migrationHint(databasePath)}`,
      )
    }
  } finally {
    database.close()
  }

  return { databasePath, warnings }
}

export function formatStartupCheckError(error: unknown) {
  if (error instanceof StartupCheckError) {
    return `[arr-hub] startup check failed\n${error.message}`
  }
  const message = error instanceof Error && error.message ? error.message : String(error)
  return `[arr-hub] startup check failed\n${message}`
}

export function shouldRunStartupChecks(env: NodeJS.ProcessEnv = process.env) {
  if (env.ARR_HUB_STARTUP_CHECKS === "1") return true
  return env.NODE_ENV !== "test" && env.VITEST !== "true"
}
