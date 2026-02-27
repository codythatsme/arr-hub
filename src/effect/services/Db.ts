import * as SqliteDrizzle from '@effect/sql-drizzle/Sqlite'
import { SqliteClient } from '@effect/sql-sqlite-node'
import { Context, Layer } from 'effect'
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import * as schema from '#/db/schema'

/** Schema-typed Drizzle handle — preserves table types unlike raw SqliteDrizzle tag. */
export class Db extends Context.Tag('Db')<
  Db,
  SqliteRemoteDatabase<typeof schema>
>() {}

const DB_PATH = process.env.DATABASE_PATH ?? 'data/arr-hub.db'

/** SqliteClient → Db (schema-typed drizzle instance) */
const DrizzleLayer = Layer.effect(
  Db,
  SqliteDrizzle.make({ schema }),
)

/** Full Db layer: SqliteClient + schema-typed Drizzle */
export const DbLive = DrizzleLayer.pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: DB_PATH })),
)
