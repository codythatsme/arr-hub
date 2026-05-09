import type { DownloadProtocol } from "#/effect/domain/downloadClient"
import type { IndexerProtocol, ReleaseCandidate } from "#/effect/domain/indexer"
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
  readonly absoluteEpisodeNumber: number | null
  readonly airDate: Date | null
  readonly seriesId: number | null
  readonly rootFolderPath: string | null
}

export interface ReleaseConstraints {
  readonly activeQueueTitles: ReadonlyArray<string>
  readonly freeSpaceBytes: number | null
  readonly allowedProtocols: ReadonlyArray<IndexerProtocol>
  readonly availableClientProtocols: ReadonlyArray<DownloadProtocol | "any">
  readonly ignoredTerms: ReadonlyArray<string>
  readonly minimumAgeHours: number
  readonly minimumSeeders: number
  readonly preferredTerms: ReadonlyArray<string>
  readonly requiredTerms: ReadonlyArray<string>
  readonly retentionDays: number
}

interface SpecificationContext {
  readonly candidate: ReleaseCandidate
  readonly parsed: ParsedTitle
  readonly evaluation: EvaluationContext
  readonly target: ReleaseTarget | null
  readonly constraints: ReleaseConstraints
}

const MIN_IMPORTABLE_SIZE_BYTES = 50 * 1024 * 1024
const MAX_IMPORTABLE_SIZE_BYTES = 250 * 1024 * 1024 * 1024
const HOURS_PER_DAY = 24

const SAMPLE_RELEASE_RE = /(?:^|[.\-_\s])sample(?:[.\-_\s]|$)/i
const HARDCODED_SUBTITLES_RE =
  /(?:^|[.\-_\s])(?:hc|hardcoded)[.\-_\s]*(?:subs?|subtitles?)(?:[.\-_\s]|$)/i
const RAW_DISK_RE =
  /(?:^|[.\-_\s])(?:bdmv|video_ts|br[.\-_\s]?disk|bd[.\-_\s]?disk|dvd[.\-_\s]?r|rawhd)(?:[.\-_\s]|$)/i
const MULTI_SEASON_RE =
  /(?:^|[.\-_\s])S(\d{1,2})(?:[.\-_\s]*(?:-|to)[.\-_\s]*S?(\d{1,2}))(?:[.\-_\s]|$)/i
const MULTI_EPISODE_RE = /S\d{1,2}E\d{1,3}(?:[.\-_\s]?E\d{1,3})+/i
const SPLIT_EPISODE_RE = /(?:^|[.\-_\s])(?:part|pt)[.\-_\s]*\d+(?:[.\-_\s]|$)/i

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

function candidateAgeHours(candidate: ReleaseCandidate): number {
  const publishedAt = candidate.publishedAt.getTime()
  if (!Number.isFinite(publishedAt)) return candidate.age * HOURS_PER_DAY
  return Math.max(0, (Date.now() - publishedAt) / 3_600_000)
}

function releaseContainsTerm(title: string, term: string): boolean {
  const normalizedTitle = title.toLowerCase().replace(/[._-]+/g, " ")
  return normalizedTitle.includes(term.toLowerCase())
}

function isFutureDate(value: Date): boolean {
  return value.getTime() > Date.now()
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
    if (ctx.target.airDate !== null && isFutureDate(ctx.target.airDate)) {
      return reject("episode_not_aired", "episode has not aired yet")
    }

    const hasSeasonEpisode = ctx.parsed.season !== null && ctx.parsed.episode !== null
    const hasMatchingAbsolute =
      ctx.target.absoluteEpisodeNumber !== null &&
      ctx.parsed.absoluteEpisode !== null &&
      ctx.parsed.absoluteEpisode === ctx.target.absoluteEpisodeNumber

    if (!hasSeasonEpisode) {
      if (hasMatchingAbsolute) return null
      if (ctx.target.absoluteEpisodeNumber !== null && ctx.parsed.absoluteEpisode !== null) {
        return reject(
          "absolute_episode_mismatch",
          `release absolute episode ${ctx.parsed.absoluteEpisode} != ${ctx.target.absoluteEpisodeNumber}`,
        )
      }
      return reject(
        "episode_required",
        "episode search result did not include season/episode or matching absolute episode",
      )
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

function tvEdgeSpecification(ctx: SpecificationContext): DecisionReason | null {
  if (ctx.evaluation.mediaType === "episode") {
    if (MULTI_EPISODE_RE.test(ctx.candidate.title)) {
      return reject(
        "multi_episode_release",
        "single episode search result contains multiple episodes",
      )
    }
    if (SPLIT_EPISODE_RE.test(ctx.candidate.title)) {
      return reject(
        "split_episode_release",
        "single episode search result appears to be a split episode",
      )
    }
  }

  if (ctx.evaluation.mediaType === "season" && MULTI_SEASON_RE.test(ctx.candidate.title)) {
    return reject("multi_season_pack", "season search result contains multiple seasons")
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
  if (
    ctx.candidate.protocol === "torrent" &&
    ctx.candidate.seeders !== null &&
    ctx.candidate.seeders < ctx.constraints.minimumSeeders
  ) {
    return reject(
      "torrent_seeders_below_minimum",
      `torrent seeders ${ctx.candidate.seeders} < ${ctx.constraints.minimumSeeders}`,
    )
  }
  return null
}

function protocolSpecification(ctx: SpecificationContext): DecisionReason | null {
  if (!ctx.constraints.allowedProtocols.includes(ctx.candidate.protocol)) {
    return reject("protocol_not_allowed", `${ctx.candidate.protocol} releases are disabled`)
  }

  const available = ctx.constraints.availableClientProtocols
  if (
    available.length > 0 &&
    !available.includes("any") &&
    !available.includes(ctx.candidate.protocol)
  ) {
    return reject(
      "download_client_protocol_unavailable",
      `no enabled download client supports ${ctx.candidate.protocol}`,
    )
  }

  return null
}

function ageAndRetentionSpecification(ctx: SpecificationContext): DecisionReason | null {
  const ageHours = candidateAgeHours(ctx.candidate)
  if (ctx.constraints.minimumAgeHours > 0 && ageHours < ctx.constraints.minimumAgeHours) {
    return reject(
      "release_too_new",
      `release age ${ageHours.toFixed(1)}h < ${ctx.constraints.minimumAgeHours}h`,
    )
  }

  if (ctx.constraints.retentionDays > 0 && ctx.candidate.age > ctx.constraints.retentionDays) {
    return reject(
      "retention_exceeded",
      `release age ${ctx.candidate.age}d > retention ${ctx.constraints.retentionDays}d`,
    )
  }

  return null
}

function releaseTermsSpecification(ctx: SpecificationContext): DecisionReason | null {
  const ignoredTerm = ctx.constraints.ignoredTerms.find((term) =>
    releaseContainsTerm(ctx.candidate.title, term),
  )
  if (ignoredTerm) {
    return reject("ignored_term", `release title contains ignored term "${ignoredTerm}"`)
  }

  const missingTerm = ctx.constraints.requiredTerms.find(
    (term) => !releaseContainsTerm(ctx.candidate.title, term),
  )
  if (missingTerm) {
    return reject(
      "required_term_missing",
      `release title is missing required term "${missingTerm}"`,
    )
  }

  return null
}

function unsafeReleaseArtifactSpecification(ctx: SpecificationContext): DecisionReason | null {
  if (SAMPLE_RELEASE_RE.test(ctx.candidate.title)) {
    return reject("sample_release", "release appears to be a sample")
  }
  if (HARDCODED_SUBTITLES_RE.test(ctx.candidate.title)) {
    return reject("hardcoded_subtitles", "release appears to contain hardcoded subtitles")
  }
  if (
    RAW_DISK_RE.test(ctx.candidate.title) ||
    ctx.parsed.qualityName === "BRDISK" ||
    ctx.parsed.qualityName === "RAWHD"
  ) {
    return reject("raw_disk_release", "raw disk releases are not importable")
  }
  return null
}

function queueConflictSpecification(ctx: SpecificationContext): DecisionReason | null {
  const candidateTitle = normalizeTitle(ctx.candidate.title)
  const conflict = ctx.constraints.activeQueueTitles.find(
    (title) => normalizeTitle(title) === candidateTitle,
  )
  return conflict
    ? reject("queue_conflict", `release is already active in queue: ${conflict}`)
    : null
}

function freeSpaceSpecification(ctx: SpecificationContext): DecisionReason | null {
  if (ctx.constraints.freeSpaceBytes === null) return null
  if (ctx.candidate.size > ctx.constraints.freeSpaceBytes) {
    return reject(
      "insufficient_free_space",
      `release size ${ctx.candidate.size} > free space ${ctx.constraints.freeSpaceBytes}`,
    )
  }
  return null
}

const RELEASE_SPECIFICATIONS = [
  titleAndEpisodeSpecification,
  tvEdgeSpecification,
  sizeSpecification,
  protocolSpecification,
  ageAndRetentionSpecification,
  releaseTermsSpecification,
  unsafeReleaseArtifactSpecification,
  torrentHealthSpecification,
  queueConflictSpecification,
  freeSpaceSpecification,
] as const

export function evaluateReleaseSpecifications(
  ctx: SpecificationContext,
): ReadonlyArray<DecisionReason> {
  return RELEASE_SPECIFICATIONS.flatMap((specification) => {
    const reason = specification(ctx)
    return reason ? [reason] : []
  })
}
