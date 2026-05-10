import { SqlError } from "@effect/sql/SqlError"
import { asc, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import {
  autoTaggingRules,
  customFilters,
  delayProfiles,
  downloadClients,
  indexers,
  importLists,
  movies,
  notificationChannels,
  releaseProfiles,
  series,
  tags,
  type CustomFilterDefinition,
} from "#/db/schema"

import { ConflictError, NotFoundError, ValidationError } from "../errors"
import { Db } from "./Db"

type DbHandle = Context.Tag.Service<typeof Db>
type TagRow = typeof tags.$inferSelect

export interface TagSummary {
  readonly tag: TagRow
  readonly usageCount: number
}

export interface TagDetails {
  readonly id: number
  readonly label: string
  readonly delayProfileIds: ReadonlyArray<number>
  readonly importListIds: ReadonlyArray<number>
  readonly notificationIds: ReadonlyArray<number>
  readonly restrictionIds: ReadonlyArray<number>
  readonly releaseProfileIds: ReadonlyArray<number>
  readonly excludedReleaseProfileIds: ReadonlyArray<number>
  readonly indexerIds: ReadonlyArray<number>
  readonly downloadClientIds: ReadonlyArray<number>
  readonly autoTagIds: ReadonlyArray<number>
  readonly seriesIds: ReadonlyArray<number>
  readonly movieIds: ReadonlyArray<number>
  readonly indexerProxyIds: ReadonlyArray<number>
  readonly applicationIds: ReadonlyArray<number>
}

interface TaggedRow {
  readonly id: number
  readonly tags: ReadonlyArray<string>
}

interface TagReferenceRows {
  readonly movieRows: ReadonlyArray<TaggedRow>
  readonly seriesRows: ReadonlyArray<TaggedRow>
  readonly indexerRows: ReadonlyArray<TaggedRow>
  readonly downloadClientRows: ReadonlyArray<TaggedRow>
  readonly notificationChannelRows: ReadonlyArray<TaggedRow>
  readonly autoTagRows: ReadonlyArray<TaggedRow>
  readonly importListRows: ReadonlyArray<TaggedRow>
  readonly releaseProfileRows: ReadonlyArray<TaggedRow>
  readonly excludedReleaseProfileRows: ReadonlyArray<TaggedRow>
  readonly delayProfileRows: ReadonlyArray<TaggedRow>
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

function customFilterTags(filters: CustomFilterDefinition): ReadonlyArray<string> {
  return filters.tags ?? []
}

function tagUsageCounts(db: DbHandle): Effect.Effect<ReadonlyMap<string, number>, SqlError> {
  return Effect.gen(function* () {
    const [
      movieRows,
      seriesRows,
      indexerRows,
      downloadClientRows,
      notificationChannelRows,
      autoTagRows,
      customFilterRows,
      importListRows,
      releaseProfileRows,
      excludedReleaseProfileRows,
      delayProfileRows,
    ] = yield* Effect.all([
      db.select({ tags: movies.tags }).from(movies),
      db.select({ tags: series.tags }).from(series),
      db.select({ tags: indexers.tags }).from(indexers),
      db.select({ tags: downloadClients.tags }).from(downloadClients),
      db.select({ tags: notificationChannels.tags }).from(notificationChannels),
      db.select({ tags: autoTaggingRules.tags }).from(autoTaggingRules),
      db.select({ filters: customFilters.filters }).from(customFilters),
      db.select({ tags: importLists.tags }).from(importLists),
      db.select({ tags: releaseProfiles.tags }).from(releaseProfiles),
      db.select({ tags: releaseProfiles.excludedTags }).from(releaseProfiles),
      db.select({ tags: delayProfiles.tags }).from(delayProfiles),
    ])
    const customFilterTagRows = customFilterRows.map((row) => ({
      tags: customFilterTags(row.filters),
    }))
    const knownLabels = new Set<string>()
    for (const row of [
      ...movieRows,
      ...seriesRows,
      ...indexerRows,
      ...downloadClientRows,
      ...notificationChannelRows,
      ...autoTagRows,
      ...customFilterTagRows,
      ...importListRows,
      ...releaseProfileRows,
      ...excludedReleaseProfileRows,
      ...delayProfileRows,
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
          usageCountFor(label, notificationChannelRows) +
          usageCountFor(label, autoTagRows) +
          usageCountFor(label, customFilterTagRows) +
          usageCountFor(label, importListRows) +
          usageCountFor(label, releaseProfileRows) +
          usageCountFor(label, excludedReleaseProfileRows) +
          usageCountFor(label, delayProfileRows),
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

function referenceIdsFor(label: string, rows: ReadonlyArray<TaggedRow>): ReadonlyArray<number> {
  return rows.filter((row) => includesTag(row.tags, label)).map((row) => row.id)
}

function tagReferenceRows(db: DbHandle): Effect.Effect<TagReferenceRows, SqlError> {
  return Effect.gen(function* () {
    const [
      movieRows,
      seriesRows,
      indexerRows,
      downloadClientRows,
      notificationChannelRows,
      autoTagRows,
      importListRows,
      releaseProfileRows,
      excludedReleaseProfileRows,
      delayProfileRows,
    ] = yield* Effect.all([
      db.select({ id: movies.id, tags: movies.tags }).from(movies),
      db.select({ id: series.id, tags: series.tags }).from(series),
      db.select({ id: indexers.id, tags: indexers.tags }).from(indexers),
      db.select({ id: downloadClients.id, tags: downloadClients.tags }).from(downloadClients),
      db
        .select({ id: notificationChannels.id, tags: notificationChannels.tags })
        .from(notificationChannels),
      db.select({ id: autoTaggingRules.id, tags: autoTaggingRules.tags }).from(autoTaggingRules),
      db.select({ id: importLists.id, tags: importLists.tags }).from(importLists),
      db.select({ id: releaseProfiles.id, tags: releaseProfiles.tags }).from(releaseProfiles),
      db
        .select({ id: releaseProfiles.id, tags: releaseProfiles.excludedTags })
        .from(releaseProfiles),
      db.select({ id: delayProfiles.id, tags: delayProfiles.tags }).from(delayProfiles),
    ])

    return {
      movieRows,
      seriesRows,
      indexerRows,
      downloadClientRows,
      notificationChannelRows,
      autoTagRows,
      importListRows,
      releaseProfileRows,
      excludedReleaseProfileRows,
      delayProfileRows,
    }
  })
}

function detailsFor(row: TagRow, refs: TagReferenceRows): TagDetails {
  return {
    id: row.id,
    label: row.label,
    delayProfileIds: referenceIdsFor(row.label, refs.delayProfileRows),
    importListIds: referenceIdsFor(row.label, refs.importListRows),
    notificationIds: referenceIdsFor(row.label, refs.notificationChannelRows),
    restrictionIds: [],
    releaseProfileIds: referenceIdsFor(row.label, refs.releaseProfileRows),
    excludedReleaseProfileIds: referenceIdsFor(row.label, refs.excludedReleaseProfileRows),
    indexerIds: referenceIdsFor(row.label, refs.indexerRows),
    downloadClientIds: referenceIdsFor(row.label, refs.downloadClientRows),
    autoTagIds: referenceIdsFor(row.label, refs.autoTagRows),
    seriesIds: referenceIdsFor(row.label, refs.seriesRows),
    movieIds: referenceIdsFor(row.label, refs.movieRows),
    indexerProxyIds: [],
    applicationIds: [],
  }
}

function replaceTagLabel(
  values: ReadonlyArray<string>,
  previousLabel: string,
  nextLabel: string,
): ReadonlyArray<string> {
  return normalizeTagLabels(
    values.map((value) =>
      value.toLocaleLowerCase() === previousLabel.toLocaleLowerCase() ? nextLabel : value,
    ),
  )
}

function sameLabels(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function propagateTagLabel(
  db: DbHandle,
  previousLabel: string,
  nextLabel: string,
): Effect.Effect<void, SqlError> {
  return Effect.gen(function* () {
    const [
      movieRows,
      seriesRows,
      indexerRows,
      downloadClientRows,
      notificationChannelRows,
      autoTagRows,
      customFilterRows,
      importListRows,
      releaseProfileRows,
      delayProfileRows,
    ] = yield* Effect.all([
      db.select({ id: movies.id, tags: movies.tags }).from(movies),
      db.select({ id: series.id, tags: series.tags }).from(series),
      db.select({ id: indexers.id, tags: indexers.tags }).from(indexers),
      db.select({ id: downloadClients.id, tags: downloadClients.tags }).from(downloadClients),
      db
        .select({ id: notificationChannels.id, tags: notificationChannels.tags })
        .from(notificationChannels),
      db.select({ id: autoTaggingRules.id, tags: autoTaggingRules.tags }).from(autoTaggingRules),
      db.select({ id: customFilters.id, filters: customFilters.filters }).from(customFilters),
      db.select({ id: importLists.id, tags: importLists.tags }).from(importLists),
      db
        .select({
          id: releaseProfiles.id,
          tags: releaseProfiles.tags,
          excludedTags: releaseProfiles.excludedTags,
        })
        .from(releaseProfiles),
      db.select({ id: delayProfiles.id, tags: delayProfiles.tags }).from(delayProfiles),
    ])

    for (const row of movieRows) {
      const next = replaceTagLabel(row.tags, previousLabel, nextLabel)
      if (!sameLabels(row.tags, next)) {
        yield* db.update(movies).set({ tags: next }).where(eq(movies.id, row.id))
      }
    }

    for (const row of seriesRows) {
      const next = replaceTagLabel(row.tags, previousLabel, nextLabel)
      if (!sameLabels(row.tags, next)) {
        yield* db.update(series).set({ tags: next }).where(eq(series.id, row.id))
      }
    }

    for (const row of indexerRows) {
      const next = replaceTagLabel(row.tags, previousLabel, nextLabel)
      if (!sameLabels(row.tags, next)) {
        yield* db.update(indexers).set({ tags: next }).where(eq(indexers.id, row.id))
      }
    }

    for (const row of downloadClientRows) {
      const next = replaceTagLabel(row.tags, previousLabel, nextLabel)
      if (!sameLabels(row.tags, next)) {
        yield* db.update(downloadClients).set({ tags: next }).where(eq(downloadClients.id, row.id))
      }
    }

    for (const row of notificationChannelRows) {
      const next = replaceTagLabel(row.tags, previousLabel, nextLabel)
      if (!sameLabels(row.tags, next)) {
        yield* db
          .update(notificationChannels)
          .set({ tags: next })
          .where(eq(notificationChannels.id, row.id))
      }
    }

    for (const row of autoTagRows) {
      const next = replaceTagLabel(row.tags, previousLabel, nextLabel)
      if (!sameLabels(row.tags, next)) {
        yield* db
          .update(autoTaggingRules)
          .set({ tags: next })
          .where(eq(autoTaggingRules.id, row.id))
      }
    }

    for (const row of customFilterRows) {
      const filterTagLabels = customFilterTags(row.filters)
      const next = replaceTagLabel(filterTagLabels, previousLabel, nextLabel)
      if (!sameLabels(filterTagLabels, next)) {
        yield* db
          .update(customFilters)
          .set({ filters: { ...row.filters, tags: next } })
          .where(eq(customFilters.id, row.id))
      }
    }

    for (const row of importListRows) {
      const next = replaceTagLabel(row.tags, previousLabel, nextLabel)
      if (!sameLabels(row.tags, next)) {
        yield* db.update(importLists).set({ tags: next }).where(eq(importLists.id, row.id))
      }
    }

    for (const row of releaseProfileRows) {
      const nextTags = replaceTagLabel(row.tags, previousLabel, nextLabel)
      const nextExcludedTags = replaceTagLabel(row.excludedTags, previousLabel, nextLabel)
      if (!sameLabels(row.tags, nextTags) || !sameLabels(row.excludedTags, nextExcludedTags)) {
        yield* db
          .update(releaseProfiles)
          .set({ tags: nextTags, excludedTags: nextExcludedTags })
          .where(eq(releaseProfiles.id, row.id))
      }
    }

    for (const row of delayProfileRows) {
      const next = replaceTagLabel(row.tags, previousLabel, nextLabel)
      if (!sameLabels(row.tags, next)) {
        yield* db.update(delayProfiles).set({ tags: next }).where(eq(delayProfiles.id, row.id))
      }
    }
  })
}

export class TagService extends Context.Tag("@arr-hub/TagService")<
  TagService,
  {
    readonly list: () => Effect.Effect<ReadonlyArray<TagSummary>, SqlError>
    readonly get: (id: number) => Effect.Effect<TagSummary, NotFoundError | SqlError>
    readonly details: (id: number) => Effect.Effect<TagDetails, NotFoundError | SqlError>
    readonly detailsList: () => Effect.Effect<ReadonlyArray<TagDetails>, SqlError>
    readonly create: (label: string) => Effect.Effect<TagSummary, ValidationError | SqlError>
    readonly update: (
      id: number,
      label: string,
    ) => Effect.Effect<TagSummary, ConflictError | NotFoundError | ValidationError | SqlError>
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

      get: (id) =>
        Effect.gen(function* () {
          const rows = yield* db.select().from(tags).where(eq(tags.id, id))
          const row = rows[0]
          if (!row) return yield* new NotFoundError({ entity: "tag", id })
          const usage = yield* tagUsageCounts(db)
          return summarize(row, usage)
        }),

      details: (id) =>
        Effect.gen(function* () {
          const rows = yield* db.select().from(tags).where(eq(tags.id, id))
          const row = rows[0]
          if (!row) return yield* new NotFoundError({ entity: "tag", id })
          const refs = yield* tagReferenceRows(db)
          return detailsFor(row, refs)
        }),

      detailsList: () =>
        Effect.gen(function* () {
          const [rows, refs] = yield* Effect.all([
            db.select().from(tags).orderBy(asc(tags.label)),
            tagReferenceRows(db),
          ])
          return rows.map((row) => detailsFor(row, refs))
        }),

      create: (label) =>
        Effect.gen(function* () {
          const normalized = normalizeTagLabels([label])[0]
          if (!normalized) {
            return yield* new ValidationError({ message: "tag label cannot be empty" })
          }

          const existingRows = yield* db.select().from(tags)
          const existing = existingRows.find(
            (row) => row.label.toLocaleLowerCase() === normalized.toLocaleLowerCase(),
          )
          if (existing) {
            return summarize(existing, yield* tagUsageCounts(db))
          }

          yield* db.insert(tags).values({ label: normalized }).onConflictDoNothing()
          const rows = yield* db.select().from(tags).where(eq(tags.label, normalized))
          return summarize(rows[0], yield* tagUsageCounts(db))
        }),

      update: (id, label) =>
        Effect.gen(function* () {
          const normalized = normalizeTagLabels([label])[0]
          if (!normalized) {
            return yield* new ValidationError({ message: "tag label cannot be empty" })
          }

          const rows = yield* db.select().from(tags)
          const row = rows.find((candidate) => candidate.id === id)
          if (!row) return yield* new NotFoundError({ entity: "tag", id })

          const conflict = rows.find(
            (candidate) =>
              candidate.id !== id &&
              candidate.label.toLocaleLowerCase() === normalized.toLocaleLowerCase(),
          )
          if (conflict) {
            return yield* new ConflictError({ entity: "tag", field: "label", value: normalized })
          }

          yield* db
            .update(tags)
            .set({ label: normalized, updatedAt: new Date() })
            .where(eq(tags.id, id))

          yield* propagateTagLabel(db, row.label, normalized)

          const updatedRows = yield* db.select().from(tags).where(eq(tags.id, id))
          const usage = yield* tagUsageCounts(db)
          return summarize(updatedRows[0], usage)
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
