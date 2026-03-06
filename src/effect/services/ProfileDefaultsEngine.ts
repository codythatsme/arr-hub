import { SqlError } from "@effect/sql/SqlError"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { qualityProfiles, customFormats, customFormatSpecs } from "#/db/schema"

import { BUNDLES, BUNDLE_LIST, type Bundle, type BundleCustomFormat } from "../domain/bundles"
import {
  NotFoundError,
  ConflictError,
  BundleNotFoundError,
  BundleVersionConflictError,
} from "../errors"
import { ConfigService } from "./ConfigService"
import { Db } from "./Db"
import {
  ProfileService,
  type ProfileWithDetails,
  type QualityItemInput,
  type FormatScoreInput,
} from "./ProfileService"

// ── Snapshot types for diff-based reapply ──

interface BundleSnapshot {
  readonly qualityItems: ReadonlyArray<QualityItemInput>
  readonly formatScores: ReadonlyArray<{ readonly formatName: string; readonly score: number }>
}

const snapshotKey = (profileId: number) => `bundle_snapshot:profile:${profileId}`

/** Build snapshot from bundle data. */
const buildSnapshot = (bundle: Bundle): BundleSnapshot => ({
  qualityItems: bundle.qualityItems.map((i) => ({
    qualityName: i.qualityName,
    groupName: i.groupName,
    weight: i.weight,
    allowed: i.allowed,
  })),
  formatScores: bundle.formatScores.map((s) => ({
    formatName: s.formatName,
    score: s.score,
  })),
})

const snapshotItemKey = (i: QualityItemInput) => `${i.qualityName ?? ""}|${i.groupName ?? ""}`

// ── Service ──

export class ProfileDefaultsEngine extends Context.Tag("@arr-hub/ProfileDefaultsEngine")<
  ProfileDefaultsEngine,
  {
    readonly listBundles: () => Effect.Effect<ReadonlyArray<Bundle>>
    readonly getBundle: (id: string) => Effect.Effect<Bundle, BundleNotFoundError>
    readonly applyBundle: (
      bundleId: string,
      profileId: number,
      opts?: { readonly force?: boolean },
    ) => Effect.Effect<
      ProfileWithDetails,
      BundleNotFoundError | BundleVersionConflictError | NotFoundError | SqlError
    >
    readonly previewEffective: (
      bundleId: string,
      overrides?: { readonly qualityItems?: ReadonlyArray<QualityItemInput> },
    ) => Effect.Effect<ProfileWithDetails, BundleNotFoundError>
    readonly previewReapply: (
      profileId: number,
      bundleId: string,
    ) => Effect.Effect<ProfileWithDetails, BundleNotFoundError | NotFoundError | SqlError>
    readonly seedDefaults: () => Effect.Effect<void, NotFoundError | ConflictError | SqlError>
  }
>() {}

export const ProfileDefaultsEngineLive = Layer.effect(
  ProfileDefaultsEngine,
  Effect.gen(function* () {
    const db = yield* Db
    const profileService = yield* ProfileService
    const configService = yield* ConfigService

    /** Resolve bundle or fail. */
    const resolveBundle = (bundleId: string): Effect.Effect<Bundle, BundleNotFoundError> => {
      const bundle = BUNDLES.get(bundleId)
      return bundle ? Effect.succeed(bundle) : Effect.fail(new BundleNotFoundError({ bundleId }))
    }

    /** Ensure all custom formats from a bundle exist in DB, return name→id map. */
    const ensureCustomFormats = (
      formats: ReadonlyArray<BundleCustomFormat>,
    ): Effect.Effect<ReadonlyMap<string, number>, SqlError> =>
      Effect.gen(function* () {
        const nameToId = new Map<string, number>()
        for (const fmt of formats) {
          // Check if exists
          const existing = yield* db
            .select({ id: customFormats.id })
            .from(customFormats)
            .where(eq(customFormats.name, fmt.name))
          if (existing.length > 0) {
            nameToId.set(fmt.name, existing[0].id)
            continue
          }
          // Create format + specs
          const [inserted] = yield* db
            .insert(customFormats)
            .values({ name: fmt.name, includeWhenRenaming: fmt.includeWhenRenaming })
            .returning()
          nameToId.set(fmt.name, inserted.id)

          if (fmt.specs.length > 0) {
            yield* db.insert(customFormatSpecs).values(
              fmt.specs.map((s) => ({
                customFormatId: inserted.id,
                name: s.name,
                field: s.field,
                pattern: s.pattern,
                negate: s.negate,
                required: s.required,
              })),
            )
          }
        }
        return nameToId
      })

    /** Convert bundle quality items + scores into ProfileService input using format name→id map. */
    const bundleToProfileInput = (
      bundle: Bundle,
      formatMap: ReadonlyMap<string, number>,
    ): {
      qualityItems: ReadonlyArray<QualityItemInput>
      formatScores: ReadonlyArray<FormatScoreInput>
    } => {
      const qualityItems: Array<QualityItemInput> = bundle.qualityItems.map((item) => ({
        qualityName: item.qualityName,
        groupName: item.groupName,
        weight: item.weight,
        allowed: item.allowed,
      }))

      const formatScores: Array<FormatScoreInput> = []
      for (const fs of bundle.formatScores) {
        const formatId = formatMap.get(fs.formatName)
        if (formatId !== undefined) {
          formatScores.push({ customFormatId: formatId, score: fs.score })
        }
      }

      return { qualityItems, formatScores }
    }

    /** Save snapshot to settings table. */
    const saveSnapshot = (
      profileId: number,
      snapshot: BundleSnapshot,
    ): Effect.Effect<void, SqlError> =>
      configService.set(snapshotKey(profileId), JSON.stringify(snapshot))

    /** Load snapshot from settings table. Returns null if not found. */
    const loadSnapshot = (profileId: number): Effect.Effect<BundleSnapshot | null, SqlError> =>
      Effect.gen(function* () {
        const raw = yield* configService.get(snapshotKey(profileId))
        if (raw === null) return null
        return JSON.parse(raw) as BundleSnapshot
      })

    /**
     * Diff-merge: given old snapshot, current profile state, and new bundle output,
     * produce merged items + scores preserving user edits.
     */
    const diffMerge = (
      oldSnapshot: BundleSnapshot,
      current: ProfileWithDetails,
      newBundle: Bundle,
      formatMap: ReadonlyMap<string, number>,
    ): {
      qualityItems: ReadonlyArray<QualityItemInput>
      formatScores: ReadonlyArray<FormatScoreInput>
    } => {
      // Build lookup: qualityName+groupName → item from old snapshot
      const oldItemMap = new Map(oldSnapshot.qualityItems.map((i) => [snapshotItemKey(i), i]))

      // Current items: detect user edits (differ from old snapshot)
      const userEditedItems = new Map<string, QualityItemInput>()
      for (const ci of current.qualityItems) {
        const key = `${ci.qualityName ?? ""}|${ci.groupName ?? ""}`
        const oldItem = oldItemMap.get(key)
        if (!oldItem || oldItem.weight !== ci.weight || oldItem.allowed !== ci.allowed) {
          userEditedItems.set(key, {
            qualityName: ci.qualityName,
            groupName: ci.groupName,
            weight: ci.weight,
            allowed: ci.allowed,
          })
        }
      }

      // Start from new bundle items, overlay user edits
      const mergedItems: Array<QualityItemInput> = newBundle.qualityItems.map((ni) => {
        const key = `${ni.qualityName ?? ""}|${ni.groupName ?? ""}`
        const userEdit = userEditedItems.get(key)
        return (
          userEdit ?? {
            qualityName: ni.qualityName,
            groupName: ni.groupName,
            weight: ni.weight,
            allowed: ni.allowed,
          }
        )
      })

      // Format scores: detect user edits
      const oldScoreMap = new Map(oldSnapshot.formatScores.map((s) => [s.formatName, s.score]))

      // Build reverse map: formatId → formatName
      const idToName = new Map<number, string>()
      for (const [name, id] of formatMap) {
        idToName.set(id, name)
      }

      const userEditedScores = new Map<string, number>()
      for (const cs of current.formatScores) {
        const name = idToName.get(cs.customFormatId)
        if (name === undefined) continue
        const oldScore = oldScoreMap.get(name)
        if (oldScore === undefined || oldScore !== cs.score) {
          userEditedScores.set(name, cs.score)
        }
      }

      // Start from new bundle scores, overlay user edits
      const mergedScores: Array<FormatScoreInput> = []
      for (const ns of newBundle.formatScores) {
        const formatId = formatMap.get(ns.formatName)
        if (formatId === undefined) continue
        const userScore = userEditedScores.get(ns.formatName)
        mergedScores.push({
          customFormatId: formatId,
          score: userScore ?? ns.score,
        })
      }

      return { qualityItems: mergedItems, formatScores: mergedScores }
    }

    return {
      listBundles: () => Effect.succeed(BUNDLE_LIST),

      getBundle: resolveBundle,

      applyBundle: (bundleId, profileId, opts) =>
        Effect.gen(function* () {
          const bundle = yield* resolveBundle(bundleId)
          const profile = yield* profileService.getById(profileId)

          // Check version conflict (same bundle, same version, no force)
          if (
            profile.profile.appliedBundleId === bundleId &&
            profile.profile.appliedBundleVersion === bundle.version &&
            !opts?.force
          ) {
            return yield* new BundleVersionConflictError({
              bundleId,
              appliedVersion: bundle.version,
              requestedVersion: bundle.version,
            })
          }

          const formatMap = yield* ensureCustomFormats(bundle.customFormats)

          // Determine if this is a reapply (same bundleId, different version)
          const isReapply =
            profile.profile.appliedBundleId === bundleId &&
            profile.profile.appliedBundleVersion !== null &&
            profile.profile.appliedBundleVersion !== bundle.version

          let items: ReadonlyArray<QualityItemInput>
          let scores: ReadonlyArray<FormatScoreInput>

          if (isReapply) {
            const oldSnapshot = yield* loadSnapshot(profileId)
            if (oldSnapshot) {
              const merged = diffMerge(oldSnapshot, profile, bundle, formatMap)
              items = merged.qualityItems
              scores = merged.formatScores
            } else {
              // No snapshot — treat as fresh apply
              const converted = bundleToProfileInput(bundle, formatMap)
              items = converted.qualityItems
              scores = converted.formatScores
            }
          } else {
            const converted = bundleToProfileInput(bundle, formatMap)
            items = converted.qualityItems
            scores = converted.formatScores
          }

          // Save snapshot of new bundle output
          yield* saveSnapshot(profileId, buildSnapshot(bundle))

          // Apply to profile
          return yield* profileService.update(profileId, {
            upgradeAllowed: bundle.upgradeAllowed,
            minFormatScore: bundle.minFormatScore,
            cutoffFormatScore: bundle.cutoffFormatScore,
            minUpgradeFormatScore: bundle.minUpgradeFormatScore,
            appliedBundleId: bundleId,
            appliedBundleVersion: bundle.version,
            qualityItems: items,
            formatScores: scores,
          })
        }),

      previewEffective: (bundleId, overrides) =>
        Effect.gen(function* () {
          const bundle = yield* resolveBundle(bundleId)

          const baseItems: ReadonlyArray<QualityItemInput> = bundle.qualityItems.map((i) => ({
            qualityName: i.qualityName,
            groupName: i.groupName,
            weight: i.weight,
            allowed: i.allowed,
          }))

          const items = overrides?.qualityItems ?? baseItems

          // Virtual profile (not persisted)
          const virtualProfile: ProfileWithDetails = {
            profile: {
              id: 0,
              name: bundle.name,
              upgradeAllowed: bundle.upgradeAllowed,
              minFormatScore: bundle.minFormatScore,
              cutoffFormatScore: bundle.cutoffFormatScore,
              minUpgradeFormatScore: bundle.minUpgradeFormatScore,
              isDefault: false,
              appliedBundleId: bundle.id,
              appliedBundleVersion: bundle.version,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            qualityItems: items.map((i, idx) => ({
              id: idx,
              profileId: 0,
              qualityName: i.qualityName,
              groupName: i.groupName,
              weight: i.weight,
              allowed: i.allowed,
            })),
            formatScores: bundle.formatScores.map((s, idx) => ({
              id: idx,
              profileId: 0,
              customFormatId: 0,
              score: s.score,
            })),
          }

          return virtualProfile
        }),

      previewReapply: (profileId, bundleId) =>
        Effect.gen(function* () {
          const bundle = yield* resolveBundle(bundleId)
          const profile = yield* profileService.getById(profileId)

          const formatMap = yield* ensureCustomFormats(bundle.customFormats)
          const oldSnapshot = yield* loadSnapshot(profileId)

          let items: ReadonlyArray<QualityItemInput>
          let scores: ReadonlyArray<FormatScoreInput>

          if (oldSnapshot) {
            const merged = diffMerge(oldSnapshot, profile, bundle, formatMap)
            items = merged.qualityItems
            scores = merged.formatScores
          } else {
            const converted = bundleToProfileInput(bundle, formatMap)
            items = converted.qualityItems
            scores = converted.formatScores
          }

          // Virtual profile
          return {
            profile: {
              ...profile.profile,
              upgradeAllowed: bundle.upgradeAllowed,
              minFormatScore: bundle.minFormatScore,
              cutoffFormatScore: bundle.cutoffFormatScore,
              minUpgradeFormatScore: bundle.minUpgradeFormatScore,
              appliedBundleId: bundleId,
              appliedBundleVersion: bundle.version,
            },
            qualityItems: items.map((i, idx) => ({
              id: idx,
              profileId,
              qualityName: i.qualityName,
              groupName: i.groupName,
              weight: i.weight,
              allowed: i.allowed,
            })),
            formatScores: scores.map((s, idx) => ({
              id: idx,
              profileId,
              customFormatId: s.customFormatId,
              score: s.score,
            })),
          }
        }),

      seedDefaults: () =>
        Effect.gen(function* () {
          // Idempotent: if any profiles exist, skip
          const existing = yield* db
            .select({ id: qualityProfiles.id })
            .from(qualityProfiles)
            .limit(1)
          if (existing.length > 0) return

          const bundle = BUNDLE_LIST[0]
          const formatMap = yield* ensureCustomFormats(bundle.customFormats)
          const converted = bundleToProfileInput(bundle, formatMap)

          const profile = yield* profileService.create({
            name: bundle.name,
            upgradeAllowed: bundle.upgradeAllowed,
            minFormatScore: bundle.minFormatScore,
            cutoffFormatScore: bundle.cutoffFormatScore,
            minUpgradeFormatScore: bundle.minUpgradeFormatScore,
            isDefault: true,
            qualityItems: converted.qualityItems,
            formatScores: converted.formatScores,
          })

          // Store snapshot + bundle tracking
          yield* saveSnapshot(profile.profile.id, buildSnapshot(bundle))
          yield* profileService.update(profile.profile.id, {
            appliedBundleId: bundle.id,
            appliedBundleVersion: bundle.version,
          })
        }),
    }
  }),
)
