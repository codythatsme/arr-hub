import { SqlError } from "@effect/sql/SqlError"
import { asc, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { downloadClients, indexers, movies, notificationChannels, series, tags } from "#/db/schema"

import { NotFoundError, ValidationError } from "../errors"
import { Db } from "./Db"

type DbHandle = Context.Tag.Service<typeof Db>
type TagRow = typeof tags.$inferSelect

export interface TagSummary {
  readonly tag: TagRow
  readonly usageCount: number
}

export function normalizeTagLabels(values: ReadonlyArray<string>): ReadonlyArray<string> {
  const seen = new Set<string>()
  const normalized: Array<string> = []

  for (const value of values) {
    const label = value.trim().replace(/\s+/g, " ")
    if (label.length === 0) continue
    const key = label.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(label)
  }

  return normalized
}

export function ensureTagRows(
  db: DbHandle,
  values: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<string>, SqlError> {
  const labels = normalizeTagLabels(values)
  return Effect.gen(function* () {
    for (const label of labels) {
      yield* db.insert(tags).values({ label }).onConflictDoNothing()
    }
    return labels
  })
}

function includesTag(values: ReadonlyArray<string>, label: string) {
  return values.some((value) => value.toLocaleLowerCase() === label.toLocaleLowerCase())
}

function usageCountFor(
  label: string,
  rows: ReadonlyArray<{ readonly tags: ReadonlyArray<string> }>,
) {
  return rows.filter((row) => includesTag(row.tags, label)).length
}

function tagUsageCounts(db: DbHandle): Effect.Effect<ReadonlyMap<string, number>, SqlError> {
  return Effect.gen(function* () {
    const [movieRows, seriesRows, indexerRows, downloadClientRows, notificationChannelRows] =
      yield* Effect.all([
        db.select({ tags: movies.tags }).from(movies),
        db.select({ tags: series.tags }).from(series),
        db.select({ tags: indexers.tags }).from(indexers),
        db.select({ tags: downloadClients.tags }).from(downloadClients),
        db.select({ tags: notificationChannels.tags }).from(notificationChannels),
      ])
    const knownLabels = new Set<string>()
    for (const row of [
      ...movieRows,
      ...seriesRows,
      ...indexerRows,
      ...downloadClientRows,
      ...notificationChannelRows,
    ]) {
      for (const label of row.tags) knownLabels.add(label)
    }

    const usage = new Map<string, number>()
    for (const label of knownLabels) {
      usage.set(
        label.toLocaleLowerCase(),
        usageCountFor(label, movieRows) +
          usageCountFor(label, seriesRows) +
          usageCountFor(label, indexerRows) +
          usageCountFor(label, downloadClientRows) +
          usageCountFor(label, notificationChannelRows),
      )
    }
    return usage
  })
}

function summarize(row: TagRow, usage: ReadonlyMap<string, number>): TagSummary {
  return {
    tag: row,
    usageCount: usage.get(row.label.toLocaleLowerCase()) ?? 0,
  }
}

export class TagService extends Context.Tag("@arr-hub/TagService")<
  TagService,
  {
    readonly list: () => Effect.Effect<ReadonlyArray<TagSummary>, SqlError>
    readonly create: (label: string) => Effect.Effect<TagSummary, ValidationError | SqlError>
    readonly remove: (id: number) => Effect.Effect<void, NotFoundError | ValidationError | SqlError>
  }
>() {}

export const TagServiceLive = Layer.effect(
  TagService,
  Effect.gen(function* () {
    const db = yield* Db

    return {
      list: () =>
        Effect.gen(function* () {
          const [rows, usage] = yield* Effect.all([
            db.select().from(tags).orderBy(asc(tags.label)),
            tagUsageCounts(db),
          ])
          return rows.map((row) => summarize(row, usage))
        }),

      create: (label) =>
        Effect.gen(function* () {
          const normalized = normalizeTagLabels([label])[0]
          if (!normalized) {
            return yield* new ValidationError({ message: "tag label cannot be empty" })
          }

          yield* db.insert(tags).values({ label: normalized }).onConflictDoNothing()
          const rows = yield* db.select().from(tags).where(eq(tags.label, normalized))
          return summarize(rows[0], new Map())
        }),

      remove: (id) =>
        Effect.gen(function* () {
          const rows = yield* db.select().from(tags).where(eq(tags.id, id))
          const row = rows[0]
          if (!row) return yield* new NotFoundError({ entity: "tag", id })

          const usage = yield* tagUsageCounts(db)
          const count = usage.get(row.label.toLocaleLowerCase()) ?? 0
          if (count > 0) {
            return yield* new ValidationError({
              message: `tag ${row.label} is used by ${count} item${count === 1 ? "" : "s"}`,
            })
          }

          yield* db.delete(tags).where(eq(tags.id, id))
        }),
    }
  }),
)
