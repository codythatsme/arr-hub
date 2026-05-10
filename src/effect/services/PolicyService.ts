import { SqlError } from "@effect/sql/SqlError"
import { asc, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import {
  delayProfileProtocols,
  delayProfiles,
  importLists,
  importListTypes,
  releaseProfiles,
  type DelayProfileProtocol,
  type ImportListSettings,
  type ImportListType,
  type ReleaseProfileTerm,
} from "#/db/schema"

import { ConflictError, NotFoundError, ValidationError } from "../errors"
import { Db } from "./Db"
import { ensureTagRows, normalizeTagLabels } from "./TagService"

export type ImportList = typeof importLists.$inferSelect
export type ReleaseProfile = typeof releaseProfiles.$inferSelect
export type DelayProfile = typeof delayProfiles.$inferSelect

export interface ImportListInput {
  readonly name: string
  readonly type?: ImportListType
  readonly enabled?: boolean
  readonly enableAuto?: boolean
  readonly qualityProfileId?: number | null
  readonly rootFolderPath?: string | null
  readonly searchOnAdd?: boolean
  readonly tags?: ReadonlyArray<string>
  readonly settings?: ImportListSettings
}

export interface ReleaseProfileInput {
  readonly name: string
  readonly enabled?: boolean
  readonly requiredTerms?: ReadonlyArray<string>
  readonly ignoredTerms?: ReadonlyArray<string>
  readonly preferredTerms?: ReadonlyArray<ReleaseProfileTerm>
  readonly indexerIds?: ReadonlyArray<number>
  readonly tags?: ReadonlyArray<string>
  readonly excludedTags?: ReadonlyArray<string>
}

export interface DelayProfileInput {
  readonly name: string
  readonly enableUsenet?: boolean
  readonly enableTorrent?: boolean
  readonly preferredProtocol?: DelayProfileProtocol
  readonly usenetDelayMinutes?: number
  readonly torrentDelayMinutes?: number
  readonly order?: number
  readonly bypassIfHighestQuality?: boolean
  readonly bypassIfAboveCustomFormatScore?: boolean
  readonly minimumCustomFormatScore?: number
  readonly tags?: ReadonlyArray<string>
}

const importListTypeSet = new Set<string>(importListTypes)
const delayProfileProtocolSet = new Set<string>(delayProfileProtocols)

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

function normalizeTerms(values: ReadonlyArray<string> | undefined): ReadonlyArray<string> {
  return normalizeTagLabels(values ?? [])
}

function normalizeIds(values: ReadonlyArray<number> | undefined): ReadonlyArray<number> {
  const seen = new Set<number>()
  const normalized: Array<number> = []
  for (const value of values ?? []) {
    const id = Math.trunc(value)
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    normalized.push(id)
  }
  return normalized
}

function normalizePreferredTerms(
  values: ReadonlyArray<ReleaseProfileTerm> | undefined,
): ReadonlyArray<ReleaseProfileTerm> {
  const seen = new Set<string>()
  const normalized: Array<ReleaseProfileTerm> = []
  for (const value of values ?? []) {
    const term = normalizeName(value.term)
    if (!term) continue
    const key = term.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push({ term, score: Number.isFinite(value.score) ? value.score : 0 })
  }
  return normalized
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.trunc(value))
}

function sameLabel(a: string, b: string): boolean {
  return a.toLocaleLowerCase() === b.toLocaleLowerCase()
}

function normalizeImportListInput(input: ImportListInput): ImportListInput | ValidationError {
  const name = normalizeName(input.name)
  if (!name) return new ValidationError({ message: "import list name is required" })

  const type = input.type ?? "custom"
  if (!importListTypeSet.has(type)) {
    return new ValidationError({ message: "import list type is invalid" })
  }

  return {
    name,
    type,
    enabled: input.enabled ?? true,
    enableAuto: input.enableAuto ?? false,
    qualityProfileId: input.qualityProfileId ?? null,
    rootFolderPath: input.rootFolderPath?.trim() || null,
    searchOnAdd: input.searchOnAdd ?? false,
    tags: normalizeTagLabels(input.tags ?? []),
    settings: input.settings ?? {},
  }
}

function normalizeReleaseProfileInput(
  input: ReleaseProfileInput,
): ReleaseProfileInput | ValidationError {
  const name = normalizeName(input.name)
  if (!name) return new ValidationError({ message: "release profile name is required" })

  return {
    name,
    enabled: input.enabled ?? true,
    requiredTerms: normalizeTerms(input.requiredTerms),
    ignoredTerms: normalizeTerms(input.ignoredTerms),
    preferredTerms: normalizePreferredTerms(input.preferredTerms),
    indexerIds: normalizeIds(input.indexerIds),
    tags: normalizeTagLabels(input.tags ?? []),
    excludedTags: normalizeTagLabels(input.excludedTags ?? []),
  }
}

function normalizeDelayProfileInput(input: DelayProfileInput): DelayProfileInput | ValidationError {
  const name = normalizeName(input.name)
  if (!name) return new ValidationError({ message: "delay profile name is required" })

  const preferredProtocol = input.preferredProtocol ?? "either"
  if (!delayProfileProtocolSet.has(preferredProtocol)) {
    return new ValidationError({ message: "delay profile preferred protocol is invalid" })
  }

  return {
    name,
    enableUsenet: input.enableUsenet ?? true,
    enableTorrent: input.enableTorrent ?? true,
    preferredProtocol,
    usenetDelayMinutes: nonNegativeInteger(input.usenetDelayMinutes, 0),
    torrentDelayMinutes: nonNegativeInteger(input.torrentDelayMinutes, 0),
    order: nonNegativeInteger(input.order, 0),
    bypassIfHighestQuality: input.bypassIfHighestQuality ?? false,
    bypassIfAboveCustomFormatScore: input.bypassIfAboveCustomFormatScore ?? false,
    minimumCustomFormatScore: nonNegativeInteger(input.minimumCustomFormatScore, 0),
    tags: normalizeTagLabels(input.tags ?? []),
  }
}

export class PolicyService extends Context.Tag("@arr-hub/PolicyService")<
  PolicyService,
  {
    readonly listImportLists: () => Effect.Effect<ReadonlyArray<ImportList>, SqlError>
    readonly createImportList: (
      input: ImportListInput,
    ) => Effect.Effect<ImportList, ConflictError | ValidationError | SqlError>
    readonly updateImportList: (
      id: number,
      input: ImportListInput,
    ) => Effect.Effect<ImportList, ConflictError | NotFoundError | ValidationError | SqlError>
    readonly removeImportList: (id: number) => Effect.Effect<void, NotFoundError | SqlError>
    readonly listReleaseProfiles: () => Effect.Effect<ReadonlyArray<ReleaseProfile>, SqlError>
    readonly createReleaseProfile: (
      input: ReleaseProfileInput,
    ) => Effect.Effect<ReleaseProfile, ConflictError | ValidationError | SqlError>
    readonly updateReleaseProfile: (
      id: number,
      input: ReleaseProfileInput,
    ) => Effect.Effect<ReleaseProfile, ConflictError | NotFoundError | ValidationError | SqlError>
    readonly removeReleaseProfile: (id: number) => Effect.Effect<void, NotFoundError | SqlError>
    readonly listDelayProfiles: () => Effect.Effect<ReadonlyArray<DelayProfile>, SqlError>
    readonly createDelayProfile: (
      input: DelayProfileInput,
    ) => Effect.Effect<DelayProfile, ConflictError | ValidationError | SqlError>
    readonly updateDelayProfile: (
      id: number,
      input: DelayProfileInput,
    ) => Effect.Effect<DelayProfile, ConflictError | NotFoundError | ValidationError | SqlError>
    readonly removeDelayProfile: (id: number) => Effect.Effect<void, NotFoundError | SqlError>
  }
>() {}

export const PolicyServiceLive = Layer.effect(
  PolicyService,
  Effect.gen(function* () {
    const db = yield* Db

    const ensureUniqueName = (
      entity: string,
      rows: ReadonlyArray<{ readonly id: number; readonly name: string }>,
      id: number | null,
      name: string,
    ) =>
      Effect.gen(function* () {
        if (rows.some((row) => row.id !== id && sameLabel(row.name, name))) {
          return yield* new ConflictError({ entity, field: "name", value: name })
        }
      })

    const findImportList = (id: number) =>
      Effect.gen(function* () {
        const rows = yield* db.select().from(importLists).where(eq(importLists.id, id))
        const row = rows[0]
        if (!row) return yield* new NotFoundError({ entity: "import_list", id })
        return row
      })

    const findReleaseProfile = (id: number) =>
      Effect.gen(function* () {
        const rows = yield* db.select().from(releaseProfiles).where(eq(releaseProfiles.id, id))
        const row = rows[0]
        if (!row) return yield* new NotFoundError({ entity: "release_profile", id })
        return row
      })

    const findDelayProfile = (id: number) =>
      Effect.gen(function* () {
        const rows = yield* db.select().from(delayProfiles).where(eq(delayProfiles.id, id))
        const row = rows[0]
        if (!row) return yield* new NotFoundError({ entity: "delay_profile", id })
        return row
      })

    return {
      listImportLists: () => db.select().from(importLists).orderBy(asc(importLists.name)),

      createImportList: (input) =>
        Effect.gen(function* () {
          const normalized = normalizeImportListInput(input)
          if (normalized instanceof ValidationError) return yield* normalized

          yield* ensureUniqueName(
            "import_list",
            yield* db.select().from(importLists),
            null,
            normalized.name,
          )
          const tags = yield* ensureTagRows(db, normalized.tags ?? [])
          const rows = yield* db
            .insert(importLists)
            .values({ ...normalized, tags })
            .returning()
          return rows[0]
        }),

      updateImportList: (id, input) =>
        Effect.gen(function* () {
          yield* findImportList(id)
          const normalized = normalizeImportListInput(input)
          if (normalized instanceof ValidationError) return yield* normalized

          yield* ensureUniqueName(
            "import_list",
            yield* db.select().from(importLists),
            id,
            normalized.name,
          )
          const tags = yield* ensureTagRows(db, normalized.tags ?? [])
          const rows = yield* db
            .update(importLists)
            .set({ ...normalized, tags, updatedAt: new Date() })
            .where(eq(importLists.id, id))
            .returning()
          return rows[0]
        }),

      removeImportList: (id) =>
        Effect.gen(function* () {
          yield* findImportList(id)
          yield* db.delete(importLists).where(eq(importLists.id, id))
        }),

      listReleaseProfiles: () =>
        db.select().from(releaseProfiles).orderBy(asc(releaseProfiles.name)),

      createReleaseProfile: (input) =>
        Effect.gen(function* () {
          const normalized = normalizeReleaseProfileInput(input)
          if (normalized instanceof ValidationError) return yield* normalized

          yield* ensureUniqueName(
            "release_profile",
            yield* db.select().from(releaseProfiles),
            null,
            normalized.name,
          )
          const [tags, excludedTags] = yield* Effect.all([
            ensureTagRows(db, normalized.tags ?? []),
            ensureTagRows(db, normalized.excludedTags ?? []),
          ])
          const rows = yield* db
            .insert(releaseProfiles)
            .values({ ...normalized, tags, excludedTags })
            .returning()
          return rows[0]
        }),

      updateReleaseProfile: (id, input) =>
        Effect.gen(function* () {
          yield* findReleaseProfile(id)
          const normalized = normalizeReleaseProfileInput(input)
          if (normalized instanceof ValidationError) return yield* normalized

          yield* ensureUniqueName(
            "release_profile",
            yield* db.select().from(releaseProfiles),
            id,
            normalized.name,
          )
          const [tags, excludedTags] = yield* Effect.all([
            ensureTagRows(db, normalized.tags ?? []),
            ensureTagRows(db, normalized.excludedTags ?? []),
          ])
          const rows = yield* db
            .update(releaseProfiles)
            .set({ ...normalized, tags, excludedTags, updatedAt: new Date() })
            .where(eq(releaseProfiles.id, id))
            .returning()
          return rows[0]
        }),

      removeReleaseProfile: (id) =>
        Effect.gen(function* () {
          yield* findReleaseProfile(id)
          yield* db.delete(releaseProfiles).where(eq(releaseProfiles.id, id))
        }),

      listDelayProfiles: () => db.select().from(delayProfiles).orderBy(asc(delayProfiles.order)),

      createDelayProfile: (input) =>
        Effect.gen(function* () {
          const normalized = normalizeDelayProfileInput(input)
          if (normalized instanceof ValidationError) return yield* normalized

          yield* ensureUniqueName(
            "delay_profile",
            yield* db.select().from(delayProfiles),
            null,
            normalized.name,
          )
          const tags = yield* ensureTagRows(db, normalized.tags ?? [])
          const rows = yield* db
            .insert(delayProfiles)
            .values({ ...normalized, tags })
            .returning()
          return rows[0]
        }),

      updateDelayProfile: (id, input) =>
        Effect.gen(function* () {
          yield* findDelayProfile(id)
          const normalized = normalizeDelayProfileInput(input)
          if (normalized instanceof ValidationError) return yield* normalized

          yield* ensureUniqueName(
            "delay_profile",
            yield* db.select().from(delayProfiles),
            id,
            normalized.name,
          )
          const tags = yield* ensureTagRows(db, normalized.tags ?? [])
          const rows = yield* db
            .update(delayProfiles)
            .set({ ...normalized, tags, updatedAt: new Date() })
            .where(eq(delayProfiles.id, id))
            .returning()
          return rows[0]
        }),

      removeDelayProfile: (id) =>
        Effect.gen(function* () {
          yield* findDelayProfile(id)
          yield* db.delete(delayProfiles).where(eq(delayProfiles.id, id))
        }),
    }
  }),
)
