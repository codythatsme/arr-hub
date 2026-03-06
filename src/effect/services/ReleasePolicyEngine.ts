import { SqlError } from "@effect/sql/SqlError"
import { eq, and } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { customFormatSpecs, releaseDecisions } from "#/db/schema"
import type { ReleaseCandidate } from "#/effect/domain/indexer"
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

import { Db } from "./Db"
import { ProfileService, type ProfileWithDetails } from "./ProfileService"
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

    return {
      evaluate: (candidates, profileId, context) =>
        Effect.gen(function* () {
          // 1. Load profile
          const profile = yield* profileService.getById(profileId)

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
