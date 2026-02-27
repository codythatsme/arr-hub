import { SqlClient } from '@effect/sql'
import { SqliteClient } from '@effect/sql-sqlite-node'
import * as SqliteDrizzle from '@effect/sql-drizzle/Sqlite'
import { Effect, Layer } from 'effect'
import { Db } from '#/effect/services/Db'
import * as schema from '#/db/schema'

/** DDL matching src/db/schema.ts — executed before Drizzle layer is created. */
const runDdl = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

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
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
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

  yield* sql`CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
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
).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })),
)
