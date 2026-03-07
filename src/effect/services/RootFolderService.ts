import { SqlError } from "@effect/sql/SqlError"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { rootFolders } from "#/db/schema"

import { NotFoundError, ValidationError } from "../errors"
import { Db } from "./Db"

type RootFolder = typeof rootFolders.$inferSelect

interface RootFolderInput {
  readonly path: string
}

export class RootFolderService extends Context.Tag("@arr-hub/RootFolderService")<
  RootFolderService,
  {
    readonly add: (input: RootFolderInput) => Effect.Effect<RootFolder, ValidationError | SqlError>
    readonly list: () => Effect.Effect<ReadonlyArray<RootFolder>, SqlError>
    readonly getById: (id: number) => Effect.Effect<RootFolder, NotFoundError | SqlError>
    readonly remove: (id: number) => Effect.Effect<void, NotFoundError | SqlError>
    readonly refreshSpace: (id: number) => Effect.Effect<RootFolder, NotFoundError | SqlError>
  }
>() {}

export const RootFolderServiceLive = Layer.effect(
  RootFolderService,
  Effect.gen(function* () {
    const db = yield* Db

    return {
      add: (input) =>
        Effect.gen(function* () {
          // Normalize path: remove trailing slash
          const normalizedPath = input.path.replace(/\/+$/, "")
          if (normalizedPath.length === 0) {
            return yield* new ValidationError({ message: "root folder path cannot be empty" })
          }

          // Check for duplicates
          const existing = yield* db
            .select({ id: rootFolders.id })
            .from(rootFolders)
            .where(eq(rootFolders.path, normalizedPath))

          if (existing.length > 0) {
            return yield* new ValidationError({
              message: `root folder already exists: ${normalizedPath}`,
            })
          }

          // Check disk space
          const space = yield* getDiskSpace(normalizedPath)

          const rows = yield* db
            .insert(rootFolders)
            .values({
              path: normalizedPath,
              freeSpaceBytes: space.freeSpaceBytes,
              totalSpaceBytes: space.totalSpaceBytes,
            })
            .returning()

          return rows[0]
        }),

      list: () => db.select().from(rootFolders),

      getById: (id) =>
        Effect.gen(function* () {
          const rows = yield* db.select().from(rootFolders).where(eq(rootFolders.id, id))
          const folder = rows[0]
          if (!folder) return yield* new NotFoundError({ entity: "rootFolder", id })
          return folder
        }),

      remove: (id) =>
        Effect.gen(function* () {
          const rows = yield* db
            .delete(rootFolders)
            .where(eq(rootFolders.id, id))
            .returning({ id: rootFolders.id })

          if (rows.length === 0) return yield* new NotFoundError({ entity: "rootFolder", id })
        }),

      refreshSpace: (id) =>
        Effect.gen(function* () {
          const rows = yield* db.select().from(rootFolders).where(eq(rootFolders.id, id))
          const folder = rows[0]
          if (!folder) return yield* new NotFoundError({ entity: "rootFolder", id })

          const space = yield* getDiskSpace(folder.path)

          const updated = yield* db
            .update(rootFolders)
            .set({
              freeSpaceBytes: space.freeSpaceBytes,
              totalSpaceBytes: space.totalSpaceBytes,
            })
            .where(eq(rootFolders.id, id))
            .returning()

          return updated[0]
        }),
    }
  }),
)

/** Get disk space for a path using Node.js fs.statfs. */
function getDiskSpace(
  path: string,
): Effect.Effect<{ freeSpaceBytes: number; totalSpaceBytes: number }, never> {
  return Effect.tryPromise({
    try: async () => {
      const { statfs } = await import("node:fs/promises")
      try {
        const stats = await statfs(path)
        return {
          freeSpaceBytes: Number(stats.bavail) * Number(stats.bsize),
          totalSpaceBytes: Number(stats.blocks) * Number(stats.bsize),
        }
      } catch {
        // Path doesn't exist yet or not accessible
        return { freeSpaceBytes: 0, totalSpaceBytes: 0 }
      }
    },
    catch: () => ({ freeSpaceBytes: 0, totalSpaceBytes: 0 }),
  }).pipe(Effect.catchAll(() => Effect.succeed({ freeSpaceBytes: 0, totalSpaceBytes: 0 })))
}
