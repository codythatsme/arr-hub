import { SqlClient } from "@effect/sql"
import * as SqliteDrizzle from "@effect/sql-drizzle/Sqlite"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { Effect, Layer } from "effect"

import * as schema from "#/db/schema"
import { Db } from "#/effect/services/Db"

/** DDL matching src/db/schema.ts — executed before Drizzle layer is created. */
const runDdl = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`PRAGMA foreign_keys = ON`

  yield* sql`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    last_used_at INTEGER,
    expires_at INTEGER,
    revoked_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE quality_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    upgrade_allowed INTEGER NOT NULL DEFAULT 0,
    min_format_score INTEGER NOT NULL DEFAULT 0,
    cutoff_format_score INTEGER NOT NULL DEFAULT 0,
    min_upgrade_format_score INTEGER NOT NULL DEFAULT 1,
    is_default INTEGER NOT NULL DEFAULT 0,
    applied_bundle_id TEXT,
    applied_bundle_version INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tmdb_id INTEGER NOT NULL UNIQUE,
    title TEXT NOT NULL,
    year INTEGER,
    overview TEXT,
    poster_path TEXT,
    status TEXT NOT NULL DEFAULT 'wanted',
    quality_profile_id INTEGER REFERENCES quality_profiles(id),
    root_folder_path TEXT,
    monitored INTEGER NOT NULL DEFAULT 1,
    added_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE quality_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES quality_profiles(id) ON DELETE CASCADE,
    quality_name TEXT,
    group_name TEXT,
    weight INTEGER NOT NULL,
    allowed INTEGER NOT NULL DEFAULT 1
  )`

  yield* sql`CREATE TABLE custom_formats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    include_when_renaming INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE custom_format_specs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    custom_format_id INTEGER NOT NULL REFERENCES custom_formats(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    field TEXT NOT NULL,
    pattern TEXT NOT NULL,
    negate INTEGER NOT NULL DEFAULT 0,
    required INTEGER NOT NULL DEFAULT 0
  )`

  yield* sql`CREATE TABLE custom_format_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES quality_profiles(id) ON DELETE CASCADE,
    custom_format_id INTEGER NOT NULL REFERENCES custom_formats(id) ON DELETE CASCADE,
    score INTEGER NOT NULL DEFAULT 0,
    UNIQUE(profile_id, custom_format_id)
  )`

  yield* sql`CREATE TABLE series (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tvdb_id INTEGER NOT NULL UNIQUE,
    title TEXT NOT NULL,
    year INTEGER,
    overview TEXT,
    poster_path TEXT,
    status TEXT NOT NULL DEFAULT 'wanted',
    network TEXT,
    root_folder_path TEXT,
    monitored INTEGER NOT NULL DEFAULT 1,
    quality_profile_id INTEGER REFERENCES quality_profiles(id),
    season_folder INTEGER NOT NULL DEFAULT 1,
    added_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE seasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    season_number INTEGER NOT NULL,
    monitored INTEGER NOT NULL DEFAULT 1,
    UNIQUE(series_id, season_number)
  )`

  yield* sql`CREATE TABLE episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    tvdb_id INTEGER NOT NULL UNIQUE,
    title TEXT NOT NULL,
    episode_number INTEGER NOT NULL,
    air_date INTEGER,
    overview TEXT,
    has_file INTEGER NOT NULL DEFAULT 0,
    file_path TEXT,
    monitored INTEGER NOT NULL DEFAULT 1,
    UNIQUE(season_id, episode_number)
  )`

  yield* sql`CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE indexers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 50,
    categories TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE indexer_health (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    indexer_id INTEGER NOT NULL UNIQUE REFERENCES indexers(id) ON DELETE CASCADE,
    last_check INTEGER NOT NULL DEFAULT (unixepoch()),
    status TEXT NOT NULL DEFAULT 'unknown',
    error_message TEXT,
    response_time_ms INTEGER
  )`

  yield* sql`CREATE TABLE download_clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    username TEXT NOT NULL,
    password_encrypted TEXT NOT NULL,
    use_ssl INTEGER NOT NULL DEFAULT 0,
    category TEXT,
    priority INTEGER NOT NULL DEFAULT 50,
    enabled INTEGER NOT NULL DEFAULT 1,
    settings TEXT NOT NULL DEFAULT '{"pollIntervalMs":5000}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE download_client_health (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    download_client_id INTEGER NOT NULL UNIQUE REFERENCES download_clients(id) ON DELETE CASCADE,
    last_check INTEGER NOT NULL DEFAULT (unixepoch()),
    status TEXT NOT NULL DEFAULT 'unknown',
    error_message TEXT,
    response_time_ms INTEGER
  )`

  yield* sql`CREATE TABLE download_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    download_client_id INTEGER NOT NULL REFERENCES download_clients(id) ON DELETE CASCADE,
    movie_id INTEGER REFERENCES movies(id) ON DELETE SET NULL,
    external_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'queued',
    title TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    progress REAL NOT NULL DEFAULT 0.0,
    eta_seconds INTEGER,
    error_message TEXT,
    added_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`
})

/**
 * In-memory SQLite + DDL + schema-typed Drizzle.
 * Each `Effect.provide(TestDbLive)` creates a fresh DB — no cross-test pollution.
 */
export const TestDbLive = Layer.effect(
  Db,
  Effect.gen(function* () {
    yield* runDdl
    return yield* SqliteDrizzle.make({ schema })
  }),
).pipe(Layer.provideMerge(SqliteClient.layer({ filename: ":memory:" })))
