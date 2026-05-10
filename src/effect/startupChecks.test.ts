import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import Database from "better-sqlite3"
import { describe, expect, it } from "vitest"

import {
  runStartupChecks,
  STARTUP_REQUIRED_COLUMNS,
  STARTUP_REQUIRED_TABLES,
  StartupCheckError,
} from "./startupChecks"

async function makeWorkspace() {
  return mkdtemp(path.join(os.tmpdir(), "arr-hub-startup-checks-"))
}

async function writeJournal(root: string, when = 2000) {
  const journalPath = path.join(root, "_journal.json")
  await writeFile(
    journalPath,
    JSON.stringify({
      version: "7",
      dialect: "sqlite",
      entries: [{ idx: 0, version: "6", when, tag: "0000_test", breakpoints: true }],
    }),
    "utf8",
  )
  return journalPath
}

function quote(identifier: string) {
  return `"${identifier}"`
}

function createSchemaShape(database: Database.Database) {
  for (const table of STARTUP_REQUIRED_TABLES) {
    database.exec(`CREATE TABLE ${quote(table)} (id integer)`)
  }

  for (const { table, column } of STARTUP_REQUIRED_COLUMNS) {
    database.exec(`ALTER TABLE ${quote(table)} ADD COLUMN ${quote(column)} text`)
  }
}

describe("startupChecks", () => {
  it("passes schema-pushed databases without migration metadata after structural validation", async () => {
    const root = await makeWorkspace()
    try {
      const databasePath = path.join(root, "arr-hub.db")
      const journalPath = await writeJournal(root)
      const database = new Database(databasePath)
      try {
        createSchemaShape(database)
      } finally {
        database.close()
      }

      const result = await runStartupChecks({ databasePath, migrationJournalPath: journalPath })

      expect(result.databasePath).toBe(databasePath)
      expect(result.warnings).toEqual([
        "database has no Drizzle migration metadata; schema shape was validated instead.",
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("fails when the database is missing", async () => {
    const root = await makeWorkspace()
    try {
      const journalPath = await writeJournal(root)

      await expect(
        runStartupChecks({
          databasePath: path.join(root, "missing.db"),
          migrationJournalPath: journalPath,
        }),
      ).rejects.toThrow(StartupCheckError)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("fails when migrations are behind", async () => {
    const root = await makeWorkspace()
    try {
      const databasePath = path.join(root, "arr-hub.db")
      const journalPath = await writeJournal(root, 3000)
      const database = new Database(databasePath)
      try {
        createSchemaShape(database)
        database.exec(
          'CREATE TABLE "__drizzle_migrations" (id integer PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)',
        )
        database
          .prepare('INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)')
          .run("old", 2000)
      } finally {
        database.close()
      }

      await expect(
        runStartupChecks({ databasePath, migrationJournalPath: journalPath }),
      ).rejects.toThrow("database migrations are behind")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("fails when required schema columns are missing", async () => {
    const root = await makeWorkspace()
    try {
      const databasePath = path.join(root, "arr-hub.db")
      const journalPath = await writeJournal(root)
      const database = new Database(databasePath)
      try {
        for (const table of STARTUP_REQUIRED_TABLES) {
          database.exec(`CREATE TABLE ${quote(table)} (id integer)`)
        }
      } finally {
        database.close()
      }

      await expect(
        runStartupChecks({ databasePath, migrationJournalPath: journalPath }),
      ).rejects.toThrow("missing columns")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
