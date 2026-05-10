import { SqlError } from "@effect/sql/SqlError"
import { eq } from "drizzle-orm"
import { Effect, type Context } from "effect"

import {
  autoTaggingRules,
  autoTaggingSpecificationTypes,
  movies,
  series,
  type AutoTaggingSpecification,
} from "#/db/schema"

import { Db } from "./Db"
import { ensureTagRows, normalizeTagLabels } from "./TagService"

type DbHandle = Context.Tag.Service<typeof Db>
type AutoTaggingRuleRow = typeof autoTaggingRules.$inferSelect
type MovieRow = typeof movies.$inferSelect
type SeriesRow = typeof series.$inferSelect
type MediaKind = "movie" | "series"

const specificationTypes = new Set<string>(autoTaggingSpecificationTypes)

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function normalizeAutoTaggingSpecifications(
  specifications: unknown,
): ReadonlyArray<AutoTaggingSpecification> {
  if (!Array.isArray(specifications)) return []

  return specifications.flatMap((specification) => {
    if (!isObject(specification)) return []
    if (typeof specification.type !== "string" || !specificationTypes.has(specification.type)) {
      return []
    }
    if (!("value" in specification)) return []

    return [
      {
        type: specification.type as AutoTaggingSpecification["type"],
        value: specification.value as AutoTaggingSpecification["value"],
        negate: specification.negate === true,
      },
    ]
  })
}

function textValues(value: AutoTaggingSpecification["value"]): ReadonlyArray<string> {
  const values = Array.isArray(value) ? value : [value]
  return values.flatMap((item) => {
    if (typeof item === "string") {
      const trimmed = item.trim()
      return trimmed.length > 0 ? [trimmed] : []
    }
    if (typeof item === "number" || typeof item === "boolean") return [String(item)]
    return []
  })
}

function numberValues(value: AutoTaggingSpecification["value"]): ReadonlyArray<number> {
  const values = Array.isArray(value) ? value : [value]
  return values.flatMap((item) => {
    const number = typeof item === "number" ? item : Number(item)
    return Number.isFinite(number) ? [number] : []
  })
}

function booleanValue(value: AutoTaggingSpecification["value"]): boolean | null {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    if (value.toLocaleLowerCase() === "true") return true
    if (value.toLocaleLowerCase() === "false") return false
  }
  return null
}

function textMatches(
  actual: string | null | undefined,
  expected: AutoTaggingSpecification["value"],
) {
  if (!actual) return false
  const actualKey = actual.toLocaleLowerCase()
  return textValues(expected).some((value) => value.toLocaleLowerCase() === actualKey)
}

function anyTextMatches(
  actualValues: ReadonlyArray<string>,
  expected: AutoTaggingSpecification["value"],
) {
  const actualKeys = new Set(actualValues.map((value) => value.toLocaleLowerCase()))
  return textValues(expected).some((value) => actualKeys.has(value.toLocaleLowerCase()))
}

function numberMatches(
  actual: number | null | undefined,
  expected: AutoTaggingSpecification["value"],
) {
  if (actual === null || actual === undefined) return false
  return numberValues(expected).includes(actual)
}

function tagKeys(tags: ReadonlyArray<string>): ReadonlySet<string> {
  return new Set(tags.map((tag) => tag.toLocaleLowerCase()))
}

function sameLabels(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function ruleAppliesToMedia(rule: AutoTaggingRuleRow, kind: MediaKind): boolean {
  return rule.mediaType === "both" || rule.mediaType === kind
}

function movieSpecificationMatches(
  movie: MovieRow,
  specification: AutoTaggingSpecification,
): boolean {
  let matched = false

  switch (specification.type) {
    case "genre":
      matched = anyTextMatches(movie.genres, specification.value)
      break
    case "status":
      matched = textMatches(movie.status, specification.value)
      break
    case "monitored": {
      const expected = booleanValue(specification.value)
      matched = expected !== null && movie.monitored === expected
      break
    }
    case "year":
      matched = numberMatches(movie.year, specification.value)
      break
    case "rootFolderPath":
      matched = textMatches(movie.rootFolderPath, specification.value)
      break
    case "qualityProfileId":
      matched = numberMatches(movie.qualityProfileId, specification.value)
      break
    case "tag":
      matched = anyTextMatches(movie.tags, specification.value)
      break
    default:
      matched = false
  }

  return specification.negate === true ? !matched : matched
}

function seriesSpecificationMatches(
  seriesRow: SeriesRow,
  specification: AutoTaggingSpecification,
): boolean {
  let matched = false

  switch (specification.type) {
    case "genre":
      matched = anyTextMatches(seriesRow.genres, specification.value)
      break
    case "status":
      matched = textMatches(seriesRow.status, specification.value)
      break
    case "monitored": {
      const expected = booleanValue(specification.value)
      matched = expected !== null && seriesRow.monitored === expected
      break
    }
    case "year":
      matched = numberMatches(seriesRow.year, specification.value)
      break
    case "rootFolderPath":
      matched = textMatches(seriesRow.rootFolderPath, specification.value)
      break
    case "qualityProfileId":
      matched = numberMatches(seriesRow.qualityProfileId, specification.value)
      break
    case "network":
      matched = textMatches(seriesRow.network, specification.value)
      break
    case "seriesType":
      matched = textMatches(seriesRow.seriesType, specification.value)
      break
    case "tag":
      matched = anyTextMatches(seriesRow.tags, specification.value)
      break
    default:
      matched = false
  }

  return specification.negate === true ? !matched : matched
}

function ruleMatchesMovie(rule: AutoTaggingRuleRow, movie: MovieRow): boolean {
  if (!ruleAppliesToMedia(rule, "movie")) return false
  const specifications = normalizeAutoTaggingSpecifications(rule.specifications)
  if (specifications.length === 0) return false
  return specifications.every((specification) => movieSpecificationMatches(movie, specification))
}

function ruleMatchesSeries(rule: AutoTaggingRuleRow, seriesRow: SeriesRow): boolean {
  if (!ruleAppliesToMedia(rule, "series")) return false
  const specifications = normalizeAutoTaggingSpecifications(rule.specifications)
  if (specifications.length === 0) return false
  return specifications.every((specification) =>
    seriesSpecificationMatches(seriesRow, specification),
  )
}

function applyRuleToTags(
  currentTags: ReadonlyArray<string>,
  rule: AutoTaggingRuleRow,
  matches: boolean,
): ReadonlyArray<string> {
  const ruleTags = normalizeTagLabels(rule.tags)
  if (ruleTags.length === 0) return currentTags

  if (matches) return normalizeTagLabels([...currentTags, ...ruleTags])
  if (!rule.removeTagsAutomatically) return currentTags

  const removeKeys = tagKeys(ruleTags)
  return currentTags.filter((tag) => !removeKeys.has(tag.toLocaleLowerCase()))
}

function applyRulesToMovieTags(
  movie: MovieRow,
  rules: ReadonlyArray<AutoTaggingRuleRow>,
): ReadonlyArray<string> {
  let nextTags = movie.tags
  for (const rule of rules) {
    nextTags = applyRuleToTags(nextTags, rule, ruleMatchesMovie(rule, { ...movie, tags: nextTags }))
  }
  return nextTags
}

export function previewAutoTagsForMovie(
  movie: MovieRow,
  rules: ReadonlyArray<AutoTaggingRuleRow>,
): ReadonlyArray<string> {
  return applyRulesToMovieTags(movie, rules)
}

function applyRulesToSeriesTags(
  seriesRow: SeriesRow,
  rules: ReadonlyArray<AutoTaggingRuleRow>,
): ReadonlyArray<string> {
  let nextTags = seriesRow.tags
  for (const rule of rules) {
    nextTags = applyRuleToTags(
      nextTags,
      rule,
      ruleMatchesSeries(rule, { ...seriesRow, tags: nextTags }),
    )
  }
  return nextTags
}

export function previewAutoTagsForSeries(
  seriesRow: SeriesRow,
  rules: ReadonlyArray<AutoTaggingRuleRow>,
): ReadonlyArray<string> {
  return applyRulesToSeriesTags(seriesRow, rules)
}

function listRules(db: DbHandle) {
  return db.select().from(autoTaggingRules)
}

export function applyAutoTagsToMovie(
  db: DbHandle,
  movie: MovieRow,
): Effect.Effect<MovieRow, SqlError> {
  return Effect.gen(function* () {
    const rules = yield* listRules(db)
    const nextTags = applyRulesToMovieTags(movie, rules)
    if (sameLabels(movie.tags, nextTags)) return movie

    const tags = yield* ensureTagRows(db, nextTags)
    const rows = yield* db.update(movies).set({ tags }).where(eq(movies.id, movie.id)).returning()
    return rows[0] ?? movie
  })
}

export function applyAutoTagsToSeries(
  db: DbHandle,
  seriesRow: SeriesRow,
): Effect.Effect<SeriesRow, SqlError> {
  return Effect.gen(function* () {
    const rules = yield* listRules(db)
    const nextTags = applyRulesToSeriesTags(seriesRow, rules)
    if (sameLabels(seriesRow.tags, nextTags)) return seriesRow

    const tags = yield* ensureTagRows(db, nextTags)
    const rows = yield* db
      .update(series)
      .set({ tags })
      .where(eq(series.id, seriesRow.id))
      .returning()
    return rows[0] ?? seriesRow
  })
}

export interface ApplyAutoTaggingResult {
  readonly moviesChanged: number
  readonly seriesChanged: number
}

export function applyAutoTagsToAll(db: DbHandle): Effect.Effect<ApplyAutoTaggingResult, SqlError> {
  return Effect.gen(function* () {
    const rules = yield* listRules(db)
    let moviesChanged = 0
    let seriesChanged = 0

    const movieRows = yield* db.select().from(movies)
    for (const movie of movieRows) {
      const nextTags = applyRulesToMovieTags(movie, rules)
      if (sameLabels(movie.tags, nextTags)) continue

      const tags = yield* ensureTagRows(db, nextTags)
      yield* db.update(movies).set({ tags }).where(eq(movies.id, movie.id))
      moviesChanged += 1
    }

    const seriesRows = yield* db.select().from(series)
    for (const seriesRow of seriesRows) {
      const nextTags = applyRulesToSeriesTags(seriesRow, rules)
      if (sameLabels(seriesRow.tags, nextTags)) continue

      const tags = yield* ensureTagRows(db, nextTags)
      yield* db.update(series).set({ tags }).where(eq(series.id, seriesRow.id))
      seriesChanged += 1
    }

    return { moviesChanged, seriesChanged }
  })
}
