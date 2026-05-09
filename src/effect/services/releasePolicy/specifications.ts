import type { ReleaseCandidate } from "#/effect/domain/indexer"
import {
  isSeasonPack,
  type DecisionReason,
  type EvaluationContext,
  type ParsedTitle,
} from "#/effect/domain/release"

export interface ReleaseTarget {
  readonly title: string
  readonly year: number | null
  readonly seasonNumber: number | null
  readonly episodeNumber: number | null
}

interface SpecificationContext {
  readonly candidate: ReleaseCandidate
  readonly parsed: ParsedTitle
  readonly evaluation: EvaluationContext
  readonly target: ReleaseTarget | null
}

const MIN_IMPORTABLE_SIZE_BYTES = 50 * 1024 * 1024
const MAX_IMPORTABLE_SIZE_BYTES = 250 * 1024 * 1024 * 1024

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
}

function titleMatches(parsedTitle: string, targetTitle: string): boolean {
  const parsed = normalizeTitle(parsedTitle)
  const target = normalizeTitle(targetTitle)
  if (parsed.length < 3 || target.length < 3) return true
  return parsed === target || parsed.includes(target) || target.includes(parsed)
}

function reject(rule: string, detail: string): DecisionReason {
  return { stage: "filter", rule, detail }
}

function titleAndEpisodeSpecification(ctx: SpecificationContext): DecisionReason | null {
  if (ctx.target === null) return null

  if (!titleMatches(ctx.parsed.title, ctx.target.title)) {
    return reject(
      "title_mismatch",
      `release title "${ctx.parsed.title}" does not match "${ctx.target.title}"`,
    )
  }

  if (
    ctx.evaluation.mediaType === "movie" &&
    ctx.target.year !== null &&
    ctx.parsed.year !== null &&
    ctx.parsed.year !== ctx.target.year
  ) {
    return reject("year_mismatch", `release year ${ctx.parsed.year} != ${ctx.target.year}`)
  }

  if (ctx.evaluation.mediaType === "episode") {
    if (ctx.parsed.season === null || ctx.parsed.episode === null) {
      return reject("episode_required", "episode search result did not include season and episode")
    }
    if (ctx.target.seasonNumber !== null && ctx.parsed.season !== ctx.target.seasonNumber) {
      return reject(
        "season_mismatch",
        `release season ${ctx.parsed.season} != ${ctx.target.seasonNumber}`,
      )
    }
    if (ctx.target.episodeNumber !== null && ctx.parsed.episode !== ctx.target.episodeNumber) {
      return reject(
        "episode_mismatch",
        `release episode ${ctx.parsed.episode} != ${ctx.target.episodeNumber}`,
      )
    }
  }

  if (ctx.evaluation.mediaType === "season") {
    if (ctx.target.seasonNumber !== null && ctx.parsed.season !== ctx.target.seasonNumber) {
      return reject(
        "season_mismatch",
        `release season ${ctx.parsed.season ?? "unknown"} != ${ctx.target.seasonNumber}`,
      )
    }
    if (!isSeasonPack(ctx.parsed)) {
      return reject("season_pack_required", "season search result was not a full season pack")
    }
  }

  return null
}

function sizeSpecification(ctx: SpecificationContext): DecisionReason | null {
  if (ctx.candidate.size <= 0) {
    return reject("invalid_size", `release size ${ctx.candidate.size} is invalid`)
  }
  if (ctx.candidate.size < MIN_IMPORTABLE_SIZE_BYTES) {
    return reject(
      "release_too_small",
      `release size ${ctx.candidate.size} < ${MIN_IMPORTABLE_SIZE_BYTES}`,
    )
  }
  if (ctx.candidate.size > MAX_IMPORTABLE_SIZE_BYTES) {
    return reject(
      "release_too_large",
      `release size ${ctx.candidate.size} > ${MAX_IMPORTABLE_SIZE_BYTES}`,
    )
  }
  return null
}

function torrentHealthSpecification(ctx: SpecificationContext): DecisionReason | null {
  if (
    ctx.candidate.protocol === "torrent" &&
    ctx.candidate.seeders !== null &&
    ctx.candidate.seeders <= 0
  ) {
    return reject("torrent_no_seeders", "torrent release has no seeders")
  }
  return null
}

const RELEASE_SPECIFICATIONS = [
  titleAndEpisodeSpecification,
  sizeSpecification,
  torrentHealthSpecification,
] as const

export function evaluateReleaseSpecifications(
  ctx: SpecificationContext,
): ReadonlyArray<DecisionReason> {
  return RELEASE_SPECIFICATIONS.flatMap((specification) => {
    const reason = specification(ctx)
    return reason ? [reason] : []
  })
}
