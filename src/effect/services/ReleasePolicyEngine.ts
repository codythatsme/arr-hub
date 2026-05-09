import { SqlError } from "@effect/sql/SqlError"
import { and, eq, inArray } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import {
  customFormatSpecs,
  downloadClients,
  downloadQueue,
  episodes,
  movies,
  releaseBlocklist,
  releaseDecisions,
  rootFolders,
  seasons,
  series,
  settings,
} from "#/db/schema"
import type { DownloadProtocol } from "#/effect/domain/downloadClient"
import type { IndexerProtocol, ReleaseCandidate } from "#/effect/domain/indexer"
import type { QualityName, SpecField } from "#/effect/domain/quality"
import type {
  DecisionReason,
  EvaluationContext,
  MediaType,
  ParsedTitle,
  RankedDecision,
} from "#/effect/domain/release"
import type { ParseFailed } from "#/effect/errors"
import { NotFoundError } from "#/effect/errors"

import { AdapterRegistry } from "./AdapterRegistry"
import { Db } from "./Db"
import { ProfileService, type ProfileWithDetails } from "./ProfileService"
import {
  evaluateReleaseSpecifications,
  type ReleaseConstraints,
  type ReleaseTarget,
} from "./releasePolicy/specifications"
import { TitleParserService } from "./TitleParserService"

// ── Quality helpers (module-scope — no closure needed) ──

/** Find a quality item's weight for a given qualityName. */
function findQualityRank(profile: ProfileWithDetails, qualityName: QualityName): number | null {
  const item = profile.qualityItems.find((qi) => qi.qualityName === qualityName)
  return item ? item.weight : null
}

/** Check if a quality is allowed in the profile. */
function isQualityAllowed(profile: ProfileWithDetails, qualityName: QualityName): boolean {
  const item = profile.qualityItems.find((qi) => qi.qualityName === qualityName)
  return item ? item.allowed : false
}

// ── Spec Matching (from Radarr CustomFormatCalculationService) ──

interface SpecRow {
  readonly field: SpecField
  readonly pattern: string
  readonly negate: boolean
  readonly required: boolean
}

function resolveField(parsed: ParsedTitle, rawTitle: string, field: SpecField): string {
  switch (field) {
    case "releaseTitle":
      return rawTitle
    case "releaseGroup":
      return parsed.releaseGroup ?? ""
    case "edition":
      return parsed.edition ?? ""
    case "source":
      return parsed.source ?? ""
    case "resolution":
      return parsed.resolution !== null ? String(parsed.resolution) : ""
    case "qualityModifier":
      return parsed.modifier ?? ""
  }
}

function specMatches(spec: SpecRow, parsed: ParsedTitle, rawTitle: string): boolean {
  const value = resolveField(parsed, rawTitle, spec.field)
  let matches: boolean
  try {
    matches = new RegExp(spec.pattern, "i").test(value)
  } catch {
    matches = false
  }
  return spec.negate ? !matches : matches
}

/**
 * Evaluate a set of specs against a parsed title.
 * Required specs: ALL must match (AND).
 * Non-required specs: at least ONE must match (OR).
 * If both present: all required AND at least one non-required.
 * If none present: no match.
 */
function formatMatchesSpecs(
  specs: ReadonlyArray<SpecRow>,
  parsed: ParsedTitle,
  rawTitle: string,
): boolean {
  if (specs.length === 0) return false

  const required = specs.filter((s) => s.required)
  const optional = specs.filter((s) => !s.required)

  const requiredPass = required.every((s) => specMatches(s, parsed, rawTitle))
  const optionalPass =
    optional.length === 0 || optional.some((s) => specMatches(s, parsed, rawTitle))

  return requiredPass && optionalPass
}

function normalizeBlockKey(value: string): string {
  return value.trim().toLowerCase()
}

function blocklistMatch(
  candidate: ReleaseCandidate,
  rows: ReadonlyArray<typeof releaseBlocklist.$inferSelect>,
): typeof releaseBlocklist.$inferSelect | null {
  const titleKey = normalizeBlockKey(candidate.title)
  const infohashKey = candidate.infohash ? normalizeBlockKey(candidate.infohash) : null

  return (
    rows.find((row) => {
      if (normalizeBlockKey(row.candidateTitle) === titleKey) return true
      if (row.downloadUrl !== null && row.downloadUrl === candidate.downloadUrl) return true
      return (
        row.infohash !== null &&
        infohashKey !== null &&
        normalizeBlockKey(row.infohash) === infohashKey
      )
    }) ?? null
  )
}

function releaseTermMatches(title: string, term: string): boolean {
  const normalizedTitle = title.toLowerCase().replace(/[._-]+/g, " ")
  return normalizedTitle.includes(term.toLowerCase())
}

function preferredTermScore(title: string, terms: ReadonlyArray<string>): number {
  return terms.reduce((score, term) => (releaseTermMatches(title, term) ? score + 10 : score), 0)
}

function loadReleaseTarget(
  db: Context.Tag.Service<typeof Db>,
  context: EvaluationContext,
): Effect.Effect<ReleaseTarget | null, SqlError> {
  if (context.mediaType === "movie") {
    return Effect.gen(function* () {
      const rows = yield* db
        .select({ title: movies.title, year: movies.year, rootFolderPath: movies.rootFolderPath })
        .from(movies)
        .where(eq(movies.id, context.mediaId))
        .limit(1)
      const row = rows[0]
      return row
        ? {
            title: row.title,
            year: row.year,
            seasonNumber: null,
            episodeNumber: null,
            absoluteEpisodeNumber: null,
            airDate: null,
            seriesId: null,
            rootFolderPath: row.rootFolderPath,
          }
        : null
    })
  }

  if (context.mediaType === "episode") {
    return Effect.gen(function* () {
      const rows = yield* db
        .select({
          title: series.title,
          year: series.year,
          seriesId: series.id,
          rootFolderPath: series.rootFolderPath,
          seasonNumber: seasons.seasonNumber,
          episodeNumber: episodes.episodeNumber,
          absoluteEpisodeNumber: episodes.absoluteEpisodeNumber,
          airDate: episodes.airDate,
        })
        .from(episodes)
        .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
        .innerJoin(series, eq(seasons.seriesId, series.id))
        .where(eq(episodes.id, context.mediaId))
        .limit(1)
      return rows[0] ?? null
    })
  }

  return Effect.gen(function* () {
    const rows = yield* db
      .select({
        title: series.title,
        year: series.year,
        seriesId: series.id,
        rootFolderPath: series.rootFolderPath,
        seasonNumber: seasons.seasonNumber,
      })
      .from(seasons)
      .innerJoin(series, eq(seasons.seriesId, series.id))
      .where(eq(seasons.id, context.mediaId))
      .limit(1)
    const row = rows[0]
    return row ? { ...row, episodeNumber: null, absoluteEpisodeNumber: null, airDate: null } : null
  })
}

const ACTIVE_QUEUE_STATUSES = ["queued", "downloading", "importing"] as const
const RELEASE_SETTING_KEYS = [
  "release.allowedProtocols",
  "release.ignoredTerms",
  "release.minimumAgeHours",
  "release.minimumSeeders",
  "release.preferredTerms",
  "release.requiredTerms",
  "release.retentionDays",
] as const

type ReleaseSettingKey = (typeof RELEASE_SETTING_KEYS)[number]

const DEFAULT_RELEASE_SETTINGS: Record<ReleaseSettingKey, string> = {
  "release.allowedProtocols": "torrent,usenet",
  "release.ignoredTerms": "",
  "release.minimumAgeHours": "0",
  "release.minimumSeeders": "1",
  "release.preferredTerms": "",
  "release.requiredTerms": "",
  "release.retentionDays": "0",
}

function parseTermList(value: string): ReadonlyArray<string> {
  return value
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function parseNonNegativeInt(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function parseAllowedProtocols(value: string): ReadonlyArray<IndexerProtocol> {
  const protocols = value
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is IndexerProtocol => part === "torrent" || part === "usenet")
  return protocols.length > 0 ? Array.from(new Set(protocols)) : ["torrent", "usenet"]
}

function loadReleaseConstraints(
  db: Context.Tag.Service<typeof Db>,
  context: EvaluationContext,
  target: ReleaseTarget | null,
  adapterRegistry: Context.Tag.Service<typeof AdapterRegistry>,
): Effect.Effect<ReleaseConstraints, SqlError> {
  return Effect.gen(function* () {
    const settingRows = yield* db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(inArray(settings.key, [...RELEASE_SETTING_KEYS]))
    const settingValues = new Map(settingRows.map((row) => [row.key, row.value]))
    const setting = (key: ReleaseSettingKey) =>
      settingValues.get(key) ?? DEFAULT_RELEASE_SETTINGS[key]

    const clientRows = yield* db
      .select({ type: downloadClients.type })
      .from(downloadClients)
      .where(eq(downloadClients.enabled, true))
    const protocolByClientType = new Map(
      adapterRegistry
        .listDownloadClientTypes()
        .map((entry) => [entry.type, entry.metadata.protocolAffinity]),
    )
    const availableClientProtocols = Array.from(
      new Set(
        clientRows.flatMap((row): ReadonlyArray<DownloadProtocol | "any"> => {
          const protocol = protocolByClientType.get(row.type)
          return protocol ? [protocol] : []
        }),
      ),
    )

    const freeSpaceRows =
      target?.rootFolderPath === null || target?.rootFolderPath === undefined
        ? []
        : yield* db
            .select({ freeSpaceBytes: rootFolders.freeSpaceBytes })
            .from(rootFolders)
            .where(eq(rootFolders.path, target.rootFolderPath))
            .limit(1)

    const activeQueueRows =
      context.mediaType === "movie"
        ? yield* db
            .select({ title: downloadQueue.title, episodeIds: downloadQueue.episodeIds })
            .from(downloadQueue)
            .where(
              and(
                eq(downloadQueue.movieId, context.mediaId),
                inArray(downloadQueue.status, [...ACTIVE_QUEUE_STATUSES]),
              ),
            )
        : target?.seriesId === null || target?.seriesId === undefined
          ? []
          : yield* db
              .select({ title: downloadQueue.title, episodeIds: downloadQueue.episodeIds })
              .from(downloadQueue)
              .where(
                and(
                  eq(downloadQueue.seriesId, target.seriesId),
                  inArray(downloadQueue.status, [...ACTIVE_QUEUE_STATUSES]),
                ),
              )

    const activeQueueTitles = activeQueueRows
      .filter((row) => {
        if (context.mediaType !== "episode") return true
        return row.episodeIds?.includes(context.mediaId) ?? false
      })
      .map((row) => row.title)

    return {
      activeQueueTitles,
      allowedProtocols: parseAllowedProtocols(setting("release.allowedProtocols")),
      availableClientProtocols,
      freeSpaceBytes: freeSpaceRows[0]?.freeSpaceBytes ?? null,
      ignoredTerms: parseTermList(setting("release.ignoredTerms")),
      minimumAgeHours: parseNonNegativeInt(setting("release.minimumAgeHours"), 0),
      minimumSeeders: parseNonNegativeInt(setting("release.minimumSeeders"), 1),
      preferredTerms: parseTermList(setting("release.preferredTerms")),
      requiredTerms: parseTermList(setting("release.requiredTerms")),
      retentionDays: parseNonNegativeInt(setting("release.retentionDays"), 0),
    }
  })
}

// ── Service ──

export class ReleasePolicyEngine extends Context.Tag("@arr-hub/ReleasePolicyEngine")<
  ReleasePolicyEngine,
  {
    readonly evaluate: (
      candidates: ReadonlyArray<ReleaseCandidate>,
      profileId: number,
      context: EvaluationContext,
    ) => Effect.Effect<ReadonlyArray<RankedDecision>, NotFoundError | ParseFailed | SqlError>
    readonly recordDecisions: (
      decisions: ReadonlyArray<RankedDecision>,
      context: EvaluationContext,
    ) => Effect.Effect<void, SqlError>
    readonly history: (
      mediaId: number,
      mediaType: MediaType,
    ) => Effect.Effect<ReadonlyArray<typeof releaseDecisions.$inferSelect>, SqlError>
  }
>() {}

export const ReleasePolicyEngineLive = Layer.effect(
  ReleasePolicyEngine,
  Effect.gen(function* () {
    const db = yield* Db
    const profileService = yield* ProfileService
    const titleParser = yield* TitleParserService
    const adapterRegistry = yield* AdapterRegistry

    return {
      evaluate: (candidates, profileId, context) =>
        Effect.gen(function* () {
          // 1. Load profile
          const profile = yield* profileService.getById(profileId)
          const target = yield* loadReleaseTarget(db, context)
          const constraints = yield* loadReleaseConstraints(db, context, target, adapterRegistry)
          const blockedRows = yield* db
            .select()
            .from(releaseBlocklist)
            .where(
              and(
                eq(releaseBlocklist.mediaId, context.mediaId),
                eq(releaseBlocklist.mediaType, context.mediaType),
              ),
            )

          // Batch-load all custom format specs for scored formats
          const scoredFormatIds = profile.formatScores.map((fs) => fs.customFormatId)
          const allSpecs =
            scoredFormatIds.length > 0 ? yield* db.select().from(customFormatSpecs) : []

          // Group specs by customFormatId
          const specsByFormatId = new Map<number, ReadonlyArray<SpecRow>>()
          for (const formatId of scoredFormatIds) {
            specsByFormatId.set(
              formatId,
              allSpecs
                .filter((s) => s.customFormatId === formatId)
                .map((s) => ({
                  field: s.field as SpecField,
                  pattern: s.pattern,
                  negate: s.negate,
                  required: s.required,
                })),
            )
          }

          // Score map: formatId → score
          const scoreMap = new Map<number, number>()
          for (const fs of profile.formatScores) {
            scoreMap.set(fs.customFormatId, fs.score)
          }

          // 2-7. Process each candidate
          const decisions: Array<RankedDecision> = []

          for (const candidate of candidates) {
            const reasons: Array<DecisionReason> = []
            const blocked = blocklistMatch(candidate, blockedRows)
            if (blocked) {
              decisions.push({
                candidate,
                parsed: null,
                qualityRank: null,
                formatScore: 0,
                decision: "rejected",
                reasons: [
                  {
                    stage: "filter",
                    rule: "blocklisted",
                    detail: blocked.reason,
                  },
                ],
              })
              continue
            }

            // 2. Parse
            const parseResult = yield* Effect.either(titleParser.parse(candidate.title))
            if (parseResult._tag === "Left") {
              decisions.push({
                candidate,
                parsed: null,
                qualityRank: null,
                formatScore: 0,
                decision: "rejected",
                reasons: [
                  { stage: "parse", rule: "parse_failed", detail: parseResult.left.message },
                ],
              })
              continue
            }
            const parsed = parseResult.right

            const specificationReasons = evaluateReleaseSpecifications({
              candidate,
              parsed,
              evaluation: context,
              target,
              constraints,
            })
            if (specificationReasons.length > 0) {
              decisions.push({
                candidate,
                parsed,
                qualityRank: null,
                formatScore: 0,
                decision: "rejected",
                reasons: specificationReasons,
              })
              continue
            }

            // 3. Filter — quality name
            if (parsed.qualityName === null) {
              decisions.push({
                candidate,
                parsed,
                qualityRank: null,
                formatScore: 0,
                decision: "rejected",
                reasons: [
                  { stage: "filter", rule: "unknown_quality", detail: "could not resolve quality" },
                ],
              })
              continue
            }

            // Filter — quality allowed
            if (!isQualityAllowed(profile, parsed.qualityName)) {
              decisions.push({
                candidate,
                parsed,
                qualityRank: null,
                formatScore: 0,
                decision: "rejected",
                reasons: [
                  {
                    stage: "filter",
                    rule: "quality_not_allowed",
                    detail: `${parsed.qualityName} not in profile`,
                  },
                ],
              })
              continue
            }

            // 4. Score
            const qualityRank = findQualityRank(profile, parsed.qualityName)
            if (qualityRank === null) {
              decisions.push({
                candidate,
                parsed,
                qualityRank: null,
                formatScore: 0,
                decision: "rejected",
                reasons: [
                  {
                    stage: "filter",
                    rule: "quality_not_allowed",
                    detail: `${parsed.qualityName} not in profile items`,
                  },
                ],
              })
              continue
            }

            // Format score
            let formatScore = 0
            for (const [formatId, specs] of specsByFormatId) {
              if (formatMatchesSpecs(specs, parsed, candidate.title)) {
                formatScore += scoreMap.get(formatId) ?? 0
              }
            }

            const preferredScore = preferredTermScore(candidate.title, constraints.preferredTerms)
            if (preferredScore > 0) {
              formatScore += preferredScore
              reasons.push({
                stage: "score",
                rule: "preferred_terms",
                detail: `+${preferredScore} from preferred terms`,
              })
            }

            // Reject if below min format score
            if (formatScore < profile.profile.minFormatScore) {
              decisions.push({
                candidate,
                parsed,
                qualityRank,
                formatScore,
                decision: "rejected",
                reasons: [
                  {
                    stage: "score",
                    rule: "format_score_below_min",
                    detail: `${formatScore} < ${profile.profile.minFormatScore}`,
                  },
                ],
              })
              continue
            }

            reasons.push({
              stage: "score",
              rule: "scored",
              detail: `quality=${parsed.qualityName} rank=${qualityRank} formatScore=${formatScore}`,
            })

            // 5. Upgrade check
            const existing = context.existingFile
            if (existing) {
              if (!profile.profile.upgradeAllowed) {
                decisions.push({
                  candidate,
                  parsed,
                  qualityRank,
                  formatScore,
                  decision: "skipped",
                  reasons: [
                    ...reasons,
                    {
                      stage: "upgrade",
                      rule: "upgrades_disabled",
                      detail: "profile disallows upgrades",
                    },
                  ],
                })
                continue
              }

              // Quality downgrade (lower weight = worse quality)
              if (qualityRank < existing.qualityRank) {
                decisions.push({
                  candidate,
                  parsed,
                  qualityRank,
                  formatScore,
                  decision: "skipped",
                  reasons: [
                    ...reasons,
                    {
                      stage: "upgrade",
                      rule: "quality_downgrade",
                      detail: `rank ${qualityRank} < existing ${existing.qualityRank}`,
                    },
                  ],
                })
                continue
              }

              // Quality upgrade (higher weight = better quality)
              if (qualityRank > existing.qualityRank) {
                decisions.push({
                  candidate,
                  parsed,
                  qualityRank,
                  formatScore,
                  decision: "upgrade",
                  reasons: [
                    ...reasons,
                    {
                      stage: "upgrade",
                      rule: "quality_upgrade",
                      detail: `rank ${qualityRank} > existing ${existing.qualityRank}`,
                    },
                  ],
                })
                continue
              }

              // Same quality — check format score
              if (formatScore <= existing.formatScore) {
                decisions.push({
                  candidate,
                  parsed,
                  qualityRank,
                  formatScore,
                  decision: "skipped",
                  reasons: [
                    ...reasons,
                    {
                      stage: "upgrade",
                      rule: "format_score_not_improved",
                      detail: `${formatScore} <= existing ${existing.formatScore}`,
                    },
                  ],
                })
                continue
              }

              if (existing.formatScore >= profile.profile.cutoffFormatScore) {
                decisions.push({
                  candidate,
                  parsed,
                  qualityRank,
                  formatScore,
                  decision: "skipped",
                  reasons: [
                    ...reasons,
                    {
                      stage: "upgrade",
                      rule: "format_score_at_cutoff",
                      detail: `existing ${existing.formatScore} >= cutoff ${profile.profile.cutoffFormatScore}`,
                    },
                  ],
                })
                continue
              }

              if (formatScore < existing.formatScore + profile.profile.minUpgradeFormatScore) {
                decisions.push({
                  candidate,
                  parsed,
                  qualityRank,
                  formatScore,
                  decision: "skipped",
                  reasons: [
                    ...reasons,
                    {
                      stage: "upgrade",
                      rule: "below_min_upgrade_score",
                      detail: `${formatScore} < ${existing.formatScore} + ${profile.profile.minUpgradeFormatScore}`,
                    },
                  ],
                })
                continue
              }

              // Format score upgrade
              decisions.push({
                candidate,
                parsed,
                qualityRank,
                formatScore,
                decision: "upgrade",
                reasons: [
                  ...reasons,
                  {
                    stage: "upgrade",
                    rule: "format_score_upgrade",
                    detail: `${formatScore} > existing ${existing.formatScore}`,
                  },
                ],
              })
              continue
            }

            // No existing file — accepted
            decisions.push({
              candidate,
              parsed,
              qualityRank,
              formatScore,
              decision: "accepted",
              reasons: [
                ...reasons,
                { stage: "rank", rule: "accepted", detail: "no existing file" },
              ],
            })
          }

          // 6. Rank — lexicographic sort
          decisions.sort((a, b) => {
            // Rejected/skipped go last
            const aAccepted = a.decision === "accepted" || a.decision === "upgrade"
            const bAccepted = b.decision === "accepted" || b.decision === "upgrade"
            if (aAccepted && !bAccepted) return -1
            if (!aAccepted && bAccepted) return 1

            // Quality rank DESC (higher weight = better quality), nulls last
            const aRank = a.qualityRank ?? -1
            const bRank = b.qualityRank ?? -1
            if (aRank !== bRank) return bRank - aRank

            // Format score DESC
            if (a.formatScore !== b.formatScore) return b.formatScore - a.formatScore

            // Seeders DESC (null last)
            const aSeeders = a.candidate.seeders ?? -1
            const bSeeders = b.candidate.seeders ?? -1
            if (aSeeders !== bSeeders) return bSeeders - aSeeders

            // Age ASC (newer preferred)
            return a.candidate.age - b.candidate.age
          })

          return decisions
        }),

      recordDecisions: (decisions, context) =>
        Effect.gen(function* () {
          if (decisions.length === 0) return

          yield* db.insert(releaseDecisions).values(
            decisions.map((d) => ({
              mediaId: context.mediaId,
              mediaType: context.mediaType,
              candidateTitle: d.candidate.title,
              indexerId: d.candidate.indexerId,
              indexerName: d.candidate.indexerName,
              qualityRank: d.qualityRank,
              formatScore: d.formatScore,
              decision: d.decision,
              reasons: d.reasons,
            })),
          )
        }),

      history: (mediaId, mediaType) =>
        Effect.gen(function* () {
          return yield* db
            .select()
            .from(releaseDecisions)
            .where(
              and(eq(releaseDecisions.mediaId, mediaId), eq(releaseDecisions.mediaType, mediaType)),
            )
        }),
    }
  }),
)
