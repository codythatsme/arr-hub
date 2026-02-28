import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/bun-sqlite"

import * as schema from "./schema.ts"

const DB_PATH = process.env.DATABASE_PATH ?? "data/arr-hub.db"
mkdirSync(dirname(DB_PATH), { recursive: true })

export const db = drizzle({ connection: DB_PATH, schema })

db.run(sql`PRAGMA journal_mode = WAL`)
