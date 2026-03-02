import { SqlError } from "@effect/sql/SqlError"
import { eq, sql, count } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { qualityProfiles, qualityItems, customFormatScores, movies, series } from "#/db/schema"

import { NotFoundError, ConflictError, ProfileInUseError } from "../errors"
import { Db } from "./Db"

// ── Types ──

type QualityProfile = typeof qualityProfiles.$inferSelect
type QualityItem = typeof qualityItems.$inferSelect
type FormatScore = typeof customFormatScores.$inferSelect

export interface ProfileWithDetails {
  readonly profile: QualityProfile
  readonly qualityItems: ReadonlyArray<QualityItem>
  readonly formatScores: ReadonlyArray<FormatScore>
}

export interface QualityItemInput {
  readonly qualityName: string | null
  readonly groupName: string | null
  readonly weight: number
  readonly allowed: boolean
}

export interface FormatScoreInput {
  readonly customFormatId: number
  readonly score: number
}

export interface ProfileInput {
  readonly name: string
  readonly upgradeAllowed?: boolean
  readonly minFormatScore?: number
  readonly cutoffFormatScore?: number
  readonly minUpgradeFormatScore?: number
  readonly isDefault?: boolean
  readonly qualityItems?: ReadonlyArray<QualityItemInput>
  readonly formatScores?: ReadonlyArray<FormatScoreInput>
}

export interface ProfileUpdate {
  readonly name?: string
  readonly upgradeAllowed?: boolean
  readonly minFormatScore?: number
  readonly cutoffFormatScore?: number
  readonly minUpgradeFormatScore?: number
  readonly isDefault?: boolean
  readonly appliedBundleId?: string | null
  readonly appliedBundleVersion?: number | null
  readonly qualityItems?: ReadonlyArray<QualityItemInput>
  readonly formatScores?: ReadonlyArray<FormatScoreInput>
}

// ── Service ──

export class ProfileService extends Context.Tag("@arr-hub/ProfileService")<
  ProfileService,
  {
    readonly create: (
      input: ProfileInput,
    ) => Effect.Effect<ProfileWithDetails, ConflictError | SqlError>
    readonly list: () => Effect.Effect<ReadonlyArray<ProfileWithDetails>, SqlError>
    readonly getById: (id: number) => Effect.Effect<ProfileWithDetails, NotFoundError | SqlError>
    readonly update: (
      id: number,
      data: ProfileUpdate,
    ) => Effect.Effect<ProfileWithDetails, NotFoundError | SqlError>
    readonly remove: (
      id: number,
    ) => Effect.Effect<void, NotFoundError | ProfileInUseError | SqlError>
    readonly getDefault: () => Effect.Effect<ProfileWithDetails | null, SqlError>
  }
>() {}

export const ProfileServiceLive = Layer.effect(
  ProfileService,
  Effect.gen(function* () {
    const db = yield* Db

    /** Load qualityItems + formatScores for a single profile row. */
    const loadDetails = (profile: QualityProfile): Effect.Effect<ProfileWithDetails, SqlError> =>
      Effect.gen(function* () {
        const items = yield* db
          .select()
          .from(qualityItems)
          .where(eq(qualityItems.profileId, profile.id))
        const scores = yield* db
          .select()
          .from(customFormatScores)
          .where(eq(customFormatScores.profileId, profile.id))
        return { profile, qualityItems: items, formatScores: scores }
      })

    /** If isDefault=true, clear isDefault on all other profiles. */
    const clearOtherDefaults = (excludeId?: number): Effect.Effect<void, SqlError> =>
      Effect.gen(function* () {
        if (excludeId !== undefined) {
          yield* db
            .update(qualityProfiles)
            .set({ isDefault: false })
            .where(sql`${qualityProfiles.id} != ${excludeId}`)
        } else {
          yield* db.update(qualityProfiles).set({ isDefault: false })
        }
      })

    /** Insert quality items for a profile. */
    const insertItems = (
      profileId: number,
      items: ReadonlyArray<QualityItemInput>,
    ): Effect.Effect<void, SqlError> =>
      items.length === 0
        ? Effect.void
        : Effect.gen(function* () {
            yield* db.insert(qualityItems).values(
              items.map((item) => ({
                profileId,
                qualityName: item.qualityName,
                groupName: item.groupName,
                weight: item.weight,
                allowed: item.allowed,
              })),
            )
          })

    /** Insert format scores for a profile. */
    const insertScores = (
      profileId: number,
      scores: ReadonlyArray<FormatScoreInput>,
    ): Effect.Effect<void, SqlError> =>
      scores.length === 0
        ? Effect.void
        : Effect.gen(function* () {
            yield* db.insert(customFormatScores).values(
              scores.map((s) => ({
                profileId,
                customFormatId: s.customFormatId,
                score: s.score,
              })),
            )
          })

    return {
      create: (input) =>
        Effect.gen(function* () {
          // Check name uniqueness
          const existing = yield* db
            .select({ id: qualityProfiles.id })
            .from(qualityProfiles)
            .where(eq(qualityProfiles.name, input.name))
          if (existing.length > 0) {
            return yield* new ConflictError({
              entity: "qualityProfile",
              field: "name",
              value: input.name,
            })
          }

          // Clear other defaults if needed
          if (input.isDefault) {
            yield* clearOtherDefaults()
          }

          // Insert profile
          const rows = yield* db
            .insert(qualityProfiles)
            .values({
              name: input.name,
              upgradeAllowed: input.upgradeAllowed ?? false,
              minFormatScore: input.minFormatScore ?? 0,
              cutoffFormatScore: input.cutoffFormatScore ?? 0,
              minUpgradeFormatScore: input.minUpgradeFormatScore ?? 1,
              isDefault: input.isDefault ?? false,
            })
            .returning()
          const profile = rows[0]

          // Insert children
          yield* insertItems(profile.id, input.qualityItems ?? [])
          yield* insertScores(profile.id, input.formatScores ?? [])

          return yield* loadDetails(profile)
        }),

      list: () =>
        Effect.gen(function* () {
          const profiles = yield* db.select().from(qualityProfiles)
          return yield* Effect.all(profiles.map(loadDetails))
        }),

      getById: (id) =>
        Effect.gen(function* () {
          const rows = yield* db.select().from(qualityProfiles).where(eq(qualityProfiles.id, id))
          const profile = rows[0]
          if (!profile) {
            return yield* new NotFoundError({ entity: "qualityProfile", id })
          }
          return yield* loadDetails(profile)
        }),

      update: (id, data) =>
        Effect.gen(function* () {
          // Verify exists
          const existingRows = yield* db
            .select()
            .from(qualityProfiles)
            .where(eq(qualityProfiles.id, id))
          if (existingRows.length === 0) {
            return yield* new NotFoundError({ entity: "qualityProfile", id })
          }

          // Clear other defaults if setting this as default
          if (data.isDefault) {
            yield* clearOtherDefaults(id)
          }

          // Build update set (only provided fields)
          const updateSet: Record<string, unknown> = { updatedAt: new Date() }
          if (data.name !== undefined) updateSet.name = data.name
          if (data.upgradeAllowed !== undefined) updateSet.upgradeAllowed = data.upgradeAllowed
          if (data.minFormatScore !== undefined) updateSet.minFormatScore = data.minFormatScore
          if (data.cutoffFormatScore !== undefined)
            updateSet.cutoffFormatScore = data.cutoffFormatScore
          if (data.minUpgradeFormatScore !== undefined)
            updateSet.minUpgradeFormatScore = data.minUpgradeFormatScore
          if (data.isDefault !== undefined) updateSet.isDefault = data.isDefault
          if (data.appliedBundleId !== undefined) updateSet.appliedBundleId = data.appliedBundleId
          if (data.appliedBundleVersion !== undefined)
            updateSet.appliedBundleVersion = data.appliedBundleVersion

          yield* db.update(qualityProfiles).set(updateSet).where(eq(qualityProfiles.id, id))

          // Replace quality items if provided (delete-all + re-insert)
          if (data.qualityItems !== undefined) {
            yield* db.delete(qualityItems).where(eq(qualityItems.profileId, id))
            yield* insertItems(id, data.qualityItems)
          }

          // Replace format scores if provided
          if (data.formatScores !== undefined) {
            yield* db.delete(customFormatScores).where(eq(customFormatScores.profileId, id))
            yield* insertScores(id, data.formatScores)
          }

          // Reload
          const updated = yield* db.select().from(qualityProfiles).where(eq(qualityProfiles.id, id))
          return yield* loadDetails(updated[0])
        }),

      remove: (id) =>
        Effect.gen(function* () {
          // Check existence
          const existing = yield* db
            .select({ id: qualityProfiles.id })
            .from(qualityProfiles)
            .where(eq(qualityProfiles.id, id))
          if (existing.length === 0) {
            return yield* new NotFoundError({ entity: "qualityProfile", id })
          }

          // Check if in use by movies or series
          const movieUsage = yield* db
            .select({ movieCount: count() })
            .from(movies)
            .where(eq(movies.qualityProfileId, id))
          const seriesUsage = yield* db
            .select({ seriesCount: count() })
            .from(series)
            .where(eq(series.qualityProfileId, id))
          const movieCount = movieUsage[0].movieCount
          const seriesCount = seriesUsage[0].seriesCount
          if (movieCount > 0 || seriesCount > 0) {
            return yield* new ProfileInUseError({ profileId: id, movieCount, seriesCount })
          }

          yield* db.delete(qualityProfiles).where(eq(qualityProfiles.id, id))
        }),

      getDefault: () =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(qualityProfiles)
            .where(eq(qualityProfiles.isDefault, true))
            .limit(1)
          if (rows.length === 0) return null
          return yield* loadDetails(rows[0])
        }),
    }
  }),
)
