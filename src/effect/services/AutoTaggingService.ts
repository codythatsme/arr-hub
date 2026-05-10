import { SqlError } from "@effect/sql/SqlError"
import { asc, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import {
  autoTaggingMediaTypes,
  autoTaggingRules,
  customFilters,
  customFilterTypes,
  type AutoTaggingMediaType,
  type AutoTaggingSpecification,
  type CustomFilterDefinition,
  type CustomFilterType,
} from "#/db/schema"

import { ConflictError, NotFoundError, ValidationError } from "../errors"
import {
  applyAutoTagsToAll,
  normalizeAutoTaggingSpecifications,
  type ApplyAutoTaggingResult,
} from "./AutoTaggingEngine"
import { Db } from "./Db"
import { ensureTagRows, normalizeTagLabels } from "./TagService"

export type AutoTaggingRule = typeof autoTaggingRules.$inferSelect
export type CustomFilter = typeof customFilters.$inferSelect

export interface AutoTaggingRuleInput {
  readonly name: string
  readonly mediaType?: AutoTaggingMediaType
  readonly tags: ReadonlyArray<string>
  readonly specifications: ReadonlyArray<AutoTaggingSpecification>
  readonly removeTagsAutomatically?: boolean
}

export interface CustomFilterInput {
  readonly type: CustomFilterType
  readonly label: string
  readonly filters: CustomFilterDefinition
}

const autoTaggingMediaTypeSet = new Set<string>(autoTaggingMediaTypes)
const customFilterTypeSet = new Set<string>(customFilterTypes)

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

function normalizeAutoTaggingRuleInput(
  input: AutoTaggingRuleInput,
): AutoTaggingRuleInput | ValidationError {
  const name = normalizeName(input.name)
  if (!name) return new ValidationError({ message: "auto-tagging rule name is required" })

  const mediaType = input.mediaType ?? "both"
  if (!autoTaggingMediaTypeSet.has(mediaType)) {
    return new ValidationError({ message: "auto-tagging media type is invalid" })
  }

  const tags = normalizeTagLabels(input.tags)
  if (tags.length === 0) {
    return new ValidationError({ message: "auto-tagging rule requires at least one tag" })
  }

  const specifications = normalizeAutoTaggingSpecifications(input.specifications)
  if (specifications.length === 0) {
    return new ValidationError({
      message: "auto-tagging rule requires at least one specification",
    })
  }

  return {
    name,
    mediaType,
    tags,
    specifications,
    removeTagsAutomatically: input.removeTagsAutomatically ?? false,
  }
}

function normalizeCustomFilterInput(input: CustomFilterInput): CustomFilterInput | ValidationError {
  const label = normalizeName(input.label)
  if (!label) return new ValidationError({ message: "custom filter label is required" })
  if (!customFilterTypeSet.has(input.type)) {
    return new ValidationError({ message: "custom filter type is invalid" })
  }

  const tags = input.filters.tags ? normalizeTagLabels(input.filters.tags) : undefined
  const genres = input.filters.genres ? normalizeTagLabels(input.filters.genres) : undefined

  return {
    type: input.type,
    label,
    filters: {
      ...input.filters,
      tags: tags && tags.length > 0 ? tags : undefined,
      genres: genres && genres.length > 0 ? genres : undefined,
    },
  }
}

function sameLabel(a: string, b: string): boolean {
  return a.toLocaleLowerCase() === b.toLocaleLowerCase()
}

export class AutoTaggingService extends Context.Tag("@arr-hub/AutoTaggingService")<
  AutoTaggingService,
  {
    readonly listRules: () => Effect.Effect<ReadonlyArray<AutoTaggingRule>, SqlError>
    readonly createRule: (
      input: AutoTaggingRuleInput,
    ) => Effect.Effect<AutoTaggingRule, ConflictError | ValidationError | SqlError>
    readonly updateRule: (
      id: number,
      input: AutoTaggingRuleInput,
    ) => Effect.Effect<AutoTaggingRule, ConflictError | NotFoundError | ValidationError | SqlError>
    readonly removeRule: (id: number) => Effect.Effect<void, NotFoundError | SqlError>
    readonly applyRules: () => Effect.Effect<ApplyAutoTaggingResult, SqlError>
    readonly listCustomFilters: () => Effect.Effect<ReadonlyArray<CustomFilter>, SqlError>
    readonly createCustomFilter: (
      input: CustomFilterInput,
    ) => Effect.Effect<CustomFilter, ConflictError | ValidationError | SqlError>
    readonly updateCustomFilter: (
      id: number,
      input: CustomFilterInput,
    ) => Effect.Effect<CustomFilter, ConflictError | NotFoundError | ValidationError | SqlError>
    readonly removeCustomFilter: (id: number) => Effect.Effect<void, NotFoundError | SqlError>
  }
>() {}

export const AutoTaggingServiceLive = Layer.effect(
  AutoTaggingService,
  Effect.gen(function* () {
    const db = yield* Db

    const findRuleById = (id: number) =>
      Effect.gen(function* () {
        const rows = yield* db.select().from(autoTaggingRules).where(eq(autoTaggingRules.id, id))
        const row = rows[0]
        if (!row) return yield* new NotFoundError({ entity: "auto_tagging_rule", id })
        return row
      })

    const findCustomFilterById = (id: number) =>
      Effect.gen(function* () {
        const rows = yield* db.select().from(customFilters).where(eq(customFilters.id, id))
        const row = rows[0]
        if (!row) return yield* new NotFoundError({ entity: "custom_filter", id })
        return row
      })

    return {
      listRules: () => db.select().from(autoTaggingRules).orderBy(asc(autoTaggingRules.name)),

      createRule: (input) =>
        Effect.gen(function* () {
          const normalized = normalizeAutoTaggingRuleInput(input)
          if (normalized instanceof ValidationError) return yield* normalized

          const existing = yield* db.select().from(autoTaggingRules)
          if (existing.some((rule) => sameLabel(rule.name, normalized.name))) {
            return yield* new ConflictError({
              entity: "auto_tagging_rule",
              field: "name",
              value: normalized.name,
            })
          }

          const tags = yield* ensureTagRows(db, normalized.tags)
          const rows = yield* db
            .insert(autoTaggingRules)
            .values({ ...normalized, tags })
            .returning()

          yield* applyAutoTagsToAll(db)
          return rows[0]
        }),

      updateRule: (id, input) =>
        Effect.gen(function* () {
          yield* findRuleById(id)
          const normalized = normalizeAutoTaggingRuleInput(input)
          if (normalized instanceof ValidationError) return yield* normalized

          const existing = yield* db.select().from(autoTaggingRules)
          if (existing.some((rule) => rule.id !== id && sameLabel(rule.name, normalized.name))) {
            return yield* new ConflictError({
              entity: "auto_tagging_rule",
              field: "name",
              value: normalized.name,
            })
          }

          const tags = yield* ensureTagRows(db, normalized.tags)
          const rows = yield* db
            .update(autoTaggingRules)
            .set({ ...normalized, tags, updatedAt: new Date() })
            .where(eq(autoTaggingRules.id, id))
            .returning()

          yield* applyAutoTagsToAll(db)
          return rows[0]
        }),

      removeRule: (id) =>
        Effect.gen(function* () {
          yield* findRuleById(id)
          yield* db.delete(autoTaggingRules).where(eq(autoTaggingRules.id, id))
        }),

      applyRules: () => applyAutoTagsToAll(db),

      listCustomFilters: () => db.select().from(customFilters).orderBy(asc(customFilters.type)),

      createCustomFilter: (input) =>
        Effect.gen(function* () {
          const normalized = normalizeCustomFilterInput(input)
          if (normalized instanceof ValidationError) return yield* normalized

          const existing = yield* db.select().from(customFilters)
          if (
            existing.some(
              (filter) =>
                filter.type === normalized.type && sameLabel(filter.label, normalized.label),
            )
          ) {
            return yield* new ConflictError({
              entity: "custom_filter",
              field: "label",
              value: normalized.label,
            })
          }

          if (normalized.filters.tags) {
            yield* ensureTagRows(db, normalized.filters.tags)
          }

          const rows = yield* db.insert(customFilters).values(normalized).returning()
          return rows[0]
        }),

      updateCustomFilter: (id, input) =>
        Effect.gen(function* () {
          yield* findCustomFilterById(id)
          const normalized = normalizeCustomFilterInput(input)
          if (normalized instanceof ValidationError) return yield* normalized

          const existing = yield* db.select().from(customFilters)
          if (
            existing.some(
              (filter) =>
                filter.id !== id &&
                filter.type === normalized.type &&
                sameLabel(filter.label, normalized.label),
            )
          ) {
            return yield* new ConflictError({
              entity: "custom_filter",
              field: "label",
              value: normalized.label,
            })
          }

          if (normalized.filters.tags) {
            yield* ensureTagRows(db, normalized.filters.tags)
          }

          const rows = yield* db
            .update(customFilters)
            .set({ ...normalized, updatedAt: new Date() })
            .where(eq(customFilters.id, id))
            .returning()
          return rows[0]
        }),

      removeCustomFilter: (id) =>
        Effect.gen(function* () {
          yield* findCustomFilterById(id)
          yield* db.delete(customFilters).where(eq(customFilters.id, id))
        }),
    }
  }),
)
