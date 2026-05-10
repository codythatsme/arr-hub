import { constants } from "node:fs"
import { access, copyFile, link, mkdir, readdir, rename, stat, unlink } from "node:fs/promises"
import path from "node:path"

import { SqlError } from "@effect/sql/SqlError"
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import {
  episodes,
  mediaFiles,
  movies,
  qualityItems,
  qualityProfiles,
  releaseDecisions,
  remotePathMappings,
  seasons,
  series,
} from "#/db/schema"
import { parseQualityName, type QualityName } from "#/effect/domain/quality"
import type { ParsedTitle } from "#/effect/domain/release"
import {
  MediaImportError,
  type MediaImportErrorReason,
  NotFoundError,
  type SettingsError,
  ValidationError,
} from "#/effect/errors"

import { Db } from "./Db"
import { recordDomainHistory } from "./OperationalHistoryService"
import { SettingsService } from "./SettingsService"
import { TitleParserService } from "./TitleParserService"

type FileHandlingMode = "copy" | "move" | "hardlink"
type MediaKind = "movie" | "episode"

interface MediaFileCandidate {
  readonly path: string
  readonly extension: string
  readonly sizeBytes: number
}

interface DecisionQuality {
  readonly qualityRank: number | null
  readonly formatScore: number | null
}

interface ImportQualityState {
  readonly qualityRank: number | null
  readonly upgradeAllowed: boolean
  readonly cutoffFormatScore: number
  readonly minUpgradeFormatScore: number
}

interface EpisodeImportTarget {
  readonly episode: typeof episodes.$inferSelect
  readonly season: typeof seasons.$inferSelect
  readonly series: typeof series.$inferSelect
  readonly candidate: MediaFileCandidate
}

export interface MediaImportResult {
  readonly mediaKind: MediaKind
  readonly mediaId: number
  readonly sourcePath: string
  readonly targetPath: string
  readonly sizeBytes: number
  readonly qualityName: QualityName
  readonly qualityRank: number | null
  readonly formatScore: number
}

export interface MovieImportInput {
  readonly movieId: number
  readonly sourcePath: string | null
  readonly releaseTitle: string
  readonly downloadClientId?: number | null
}

export interface EpisodeImportInput {
  readonly seriesId: number
  readonly episodeIds: ReadonlyArray<number>
  readonly sourcePath: string | null
  readonly releaseTitle: string
  readonly downloadClientId?: number | null
}

export interface ManualMovieImportInput {
  readonly movieId: number
  readonly sourcePath: string
  readonly releaseTitle?: string | null
}

export interface ManualEpisodeImportInput {
  readonly seriesId: number
  readonly episodeIds: ReadonlyArray<number>
  readonly sourcePath: string
  readonly releaseTitle?: string | null
}

export interface RemotePathMappingInput {
  readonly downloadClientId?: number | null
  readonly remotePath: string
  readonly localPath: string
}

export interface LibraryScanResult {
  readonly moviesScanned: number
  readonly moviesImported: number
  readonly seriesScanned: number
  readonly episodesImported: number
}

export interface RenamePlan {
  readonly mediaKind: MediaKind
  readonly mediaId: number
  readonly currentPath: string
  readonly targetPath: string
}

type MediaImportFailure = MediaImportError | NotFoundError | SettingsError | SqlError
type MediaManagementFailure = MediaImportFailure | ValidationError

export class MediaImportService extends Context.Tag("@arr-hub/MediaImportService")<
  MediaImportService,
  {
    readonly importMovie: (
      input: MovieImportInput,
    ) => Effect.Effect<MediaImportResult, MediaImportFailure>
    readonly importEpisodes: (
      input: EpisodeImportInput,
    ) => Effect.Effect<ReadonlyArray<MediaImportResult>, MediaImportFailure>
    readonly manualImportMovie: (
      input: ManualMovieImportInput,
    ) => Effect.Effect<MediaImportResult, MediaImportFailure>
    readonly manualImportEpisodes: (
      input: ManualEpisodeImportInput,
    ) => Effect.Effect<ReadonlyArray<MediaImportResult>, MediaImportFailure>
    readonly listRemotePathMappings: () => Effect.Effect<
      ReadonlyArray<typeof remotePathMappings.$inferSelect>,
      SqlError
    >
    readonly addRemotePathMapping: (
      input: RemotePathMappingInput,
    ) => Effect.Effect<typeof remotePathMappings.$inferSelect, MediaManagementFailure>
    readonly updateRemotePathMapping: (
      id: number,
      input: RemotePathMappingInput,
    ) => Effect.Effect<typeof remotePathMappings.$inferSelect, MediaManagementFailure>
    readonly removeRemotePathMapping: (id: number) => Effect.Effect<void, NotFoundError | SqlError>
    readonly scanLibraries: () => Effect.Effect<LibraryScanResult, MediaImportFailure>
    readonly previewMovieRename: (
      movieId: number,
    ) => Effect.Effect<ReadonlyArray<RenamePlan>, MediaImportFailure>
    readonly renameMovie: (
      movieId: number,
    ) => Effect.Effect<ReadonlyArray<RenamePlan>, MediaImportFailure>
    readonly previewSeriesRename: (
      seriesId: number,
    ) => Effect.Effect<ReadonlyArray<RenamePlan>, MediaImportFailure>
    readonly renameSeries: (
      seriesId: number,
    ) => Effect.Effect<ReadonlyArray<RenamePlan>, MediaImportFailure>
  }
>() {}

const VIDEO_EXTENSIONS = new Set([".mkv", ".mp4", ".avi", ".mov", ".m4v", ".ts", ".wmv"])
const SAMPLE_TOKEN = /(?:^|[.\-_\s])sample(?:[.\-_\s]|$)/i
const SEASON_EPISODE = /S(\d{1,2})E(\d{1,3})/i
const SEASON_EPISODE_ALT = /(\d{1,2})x(\d{2,3})/i
const MULTI_SEASON_RE =
  /(?:^|[.\-_\s])S(\d{1,2})(?:[.\-_\s]*(?:-|to)[.\-_\s]*S?(\d{1,2}))(?:[.\-_\s]|$)/i
const MULTI_EPISODE_RE = /S\d{1,2}E\d{1,3}(?:[.\-_\s]?E\d{1,3})+/i
const SPLIT_EPISODE_RE = /(?:^|[.\-_\s])(?:part|pt)[.\-_\s]*\d+(?:[.\-_\s]|$)/i

function mediaImportError(
  reason: MediaImportErrorReason,
  message: string,
  retryable: boolean,
): MediaImportError {
  return new MediaImportError({ reason, message, retryable })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function nodeCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { readonly code: unknown }).code)
    : null
}

function isVideoFile(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase()
  if (!VIDEO_EXTENSIONS.has(extension)) return false
  return !SAMPLE_TOKEN.test(path.basename(filePath))
}

function compareBySizeDesc(a: MediaFileCandidate, b: MediaFileCandidate): number {
  return b.sizeBytes - a.sizeBytes || a.path.localeCompare(b.path)
}

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

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

function extractMultiEpisodeNumbers(releaseTitle: string): ReadonlyArray<number> {
  if (!MULTI_EPISODE_RE.test(releaseTitle)) return []
  return [...releaseTitle.matchAll(/E(\d{1,3})/gi)].map((match) => Number(match[1]))
}

function sameNumberSet(a: ReadonlyArray<number>, b: ReadonlyArray<number>): boolean {
  if (a.length !== b.length) return false
  const aSet = new Set(a)
  const bSet = new Set(b)
  if (aSet.size !== bSet.size) return false
  return [...aSet].every((value) => bSet.has(value))
}

function isInvalidPathChar(char: string): boolean {
  return char.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(char)
}

function safeSegment(value: string, fallback: string): string {
  const cleaned = Array.from(value, (char) => (isInvalidPathChar(char) ? " " : char))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
  if (cleaned.length === 0) return fallback
  return cleaned.slice(0, 180)
}

function renderNamingConvention(
  template: string,
  tokens: {
    readonly Title: string
    readonly Year: string
    readonly Quality: string
    readonly ReleaseTitle: string
  },
): string {
  return template.replace(/\{(Title|Year|Quality|ReleaseTitle)\}/gi, (_, key: string) => {
    const canonicalKey = key.toLowerCase()
    if (canonicalKey === "title") return tokens.Title
    if (canonicalKey === "year") return tokens.Year
    if (canonicalKey === "quality") return tokens.Quality
    return tokens.ReleaseTitle
  })
}

function ensureQualityInName(baseName: string, qualityName: QualityName): string {
  return baseName.toLowerCase().includes(qualityName.toLowerCase())
    ? baseName
    : `${baseName} - ${qualityName}`
}

function episodeKeyFromPath(
  filePath: string,
): { readonly season: number; readonly episode: number } | null {
  const basename = path.basename(filePath)
  const standard = SEASON_EPISODE.exec(basename)
  if (standard) return { season: Number(standard[1]), episode: Number(standard[2]) }
  const alternate = SEASON_EPISODE_ALT.exec(basename)
  if (alternate) return { season: Number(alternate[1]), episode: Number(alternate[2]) }
  return null
}

function parseFileHandling(value: string): FileHandlingMode {
  return value === "move" || value === "hardlink" ? value : "copy"
}

function releaseTitleFromPath(sourcePath: string): string {
  return path.basename(stripTrailingPathSeparators(sourcePath.trim())) || sourcePath.trim()
}

function validateRemotePathMappingInput(input: RemotePathMappingInput) {
  const remotePath = input.remotePath.trim()
  const localPath = input.localPath.trim()
  if (remotePath.length === 0 || localPath.length === 0) {
    return Effect.fail(
      new ValidationError({ message: "remote and local paths are required for path mappings" }),
    )
  }
  return Effect.succeed({
    downloadClientId: input.downloadClientId ?? null,
    remotePath,
    localPath,
  })
}

function stripTrailingPathSeparators(value: string): string {
  return value.replace(/[\\/]+$/g, "")
}

function applyRemotePathMapping(
  sourcePath: string | null,
  mappings: ReadonlyArray<typeof remotePathMappings.$inferSelect>,
): string | null {
  if (sourcePath === null || sourcePath.trim().length === 0) return sourcePath
  const source = sourcePath.trim()
  const sortedMappings = mappings
    .filter((mapping) => mapping.remotePath.trim().length > 0)
    .toSorted((a, b) => b.remotePath.length - a.remotePath.length)

  for (const mapping of sortedMappings) {
    const remotePath = stripTrailingPathSeparators(mapping.remotePath.trim())
    const localPath = stripTrailingPathSeparators(mapping.localPath.trim())
    if (remotePath.length === 0 || localPath.length === 0) continue
    if (
      source === remotePath ||
      source.startsWith(`${remotePath}/`) ||
      source.startsWith(`${remotePath}\\`)
    ) {
      const remainder = source.slice(remotePath.length).replace(/^[\\/]+/g, "")
      return remainder.length > 0 ? path.join(localPath, remainder) : localPath
    }
  }

  return source
}

function resolveSourcePath(
  db: Context.Tag.Service<typeof Db>,
  sourcePath: string | null,
  downloadClientId: number | null,
): Effect.Effect<string | null, SqlError> {
  if (sourcePath === null || sourcePath.trim().length === 0) return Effect.succeed(sourcePath)

  return Effect.gen(function* () {
    const mappings =
      downloadClientId === null
        ? yield* db
            .select()
            .from(remotePathMappings)
            .where(isNull(remotePathMappings.downloadClientId))
        : yield* db
            .select()
            .from(remotePathMappings)
            .where(
              or(
                eq(remotePathMappings.downloadClientId, downloadClientId),
                isNull(remotePathMappings.downloadClientId),
              ),
            )

    return applyRemotePathMapping(sourcePath, mappings)
  })
}

function qualityRankFallback(
  db: Context.Tag.Service<typeof Db>,
  profileId: number | null,
  qualityName: QualityName,
): Effect.Effect<number | null, SqlError> {
  if (profileId === null) return Effect.succeed(null)
  return Effect.gen(function* () {
    const rows = yield* db
      .select({ weight: qualityItems.weight })
      .from(qualityItems)
      .where(and(eq(qualityItems.profileId, profileId), eq(qualityItems.qualityName, qualityName)))
      .limit(1)
    return rows[0]?.weight ?? null
  })
}

function loadImportQualityState(
  db: Context.Tag.Service<typeof Db>,
  profileId: number | null,
  qualityName: QualityName,
): Effect.Effect<ImportQualityState, MediaImportError | SqlError> {
  if (profileId === null) {
    return Effect.fail(
      mediaImportError("quality_not_allowed", "import target has no quality profile", false),
    )
  }

  return Effect.gen(function* () {
    const profileRows = yield* db
      .select({
        upgradeAllowed: qualityProfiles.upgradeAllowed,
        cutoffFormatScore: qualityProfiles.cutoffFormatScore,
        minUpgradeFormatScore: qualityProfiles.minUpgradeFormatScore,
      })
      .from(qualityProfiles)
      .where(eq(qualityProfiles.id, profileId))
      .limit(1)
    const profile = profileRows[0]
    if (!profile) {
      return yield* mediaImportError(
        "quality_not_allowed",
        `quality profile ${profileId} was not found`,
        false,
      )
    }

    const itemRows = yield* db
      .select({ weight: qualityItems.weight, allowed: qualityItems.allowed })
      .from(qualityItems)
      .where(and(eq(qualityItems.profileId, profileId), eq(qualityItems.qualityName, qualityName)))
      .limit(1)
    const item = itemRows[0]
    if (!item || !item.allowed) {
      return yield* mediaImportError(
        "quality_not_allowed",
        `${qualityName} is not allowed by the target quality profile`,
        false,
      )
    }

    return {
      qualityRank: item.weight,
      upgradeAllowed: profile.upgradeAllowed,
      cutoffFormatScore: profile.cutoffFormatScore,
      minUpgradeFormatScore: profile.minUpgradeFormatScore,
    }
  })
}

function validateMovieRelease(
  movie: typeof movies.$inferSelect,
  parsed: ParsedTitle,
): Effect.Effect<void, MediaImportError> {
  if (!titleMatches(parsed.title, movie.title)) {
    return Effect.fail(
      mediaImportError(
        "media_mismatch",
        `release title "${parsed.title}" does not match movie "${movie.title}"`,
        false,
      ),
    )
  }

  if (movie.year !== null && parsed.year !== null && parsed.year !== movie.year) {
    return Effect.fail(
      mediaImportError(
        "media_mismatch",
        `release year ${parsed.year} does not match movie year ${movie.year}`,
        false,
      ),
    )
  }

  return Effect.void
}

function validateEpisodeRelease(
  releaseTitle: string,
  parsed: ParsedTitle,
  targets: ReadonlyArray<{
    readonly episode: typeof episodes.$inferSelect
    readonly season: typeof seasons.$inferSelect
    readonly series: typeof series.$inferSelect
  }>,
): Effect.Effect<void, MediaImportError> {
  const first = targets[0]
  if (!first) return Effect.void

  if (!titleMatches(parsed.title, first.series.title)) {
    return Effect.fail(
      mediaImportError(
        "media_mismatch",
        `release title "${parsed.title}" does not match series "${first.series.title}"`,
        false,
      ),
    )
  }

  if (MULTI_SEASON_RE.test(releaseTitle)) {
    return Effect.fail(
      mediaImportError(
        "episode_match_failed",
        "multi-season releases are not supported for completed episode imports",
        false,
      ),
    )
  }

  const seasonNumbers = [...new Set(targets.map((target) => target.season.seasonNumber))]
  if (seasonNumbers.length !== 1) {
    return Effect.fail(
      mediaImportError(
        "episode_match_failed",
        "completed episode imports must target one season at a time",
        false,
      ),
    )
  }

  const targetSeason = seasonNumbers[0]
  if (parsed.season !== null && parsed.season !== targetSeason) {
    return Effect.fail(
      mediaImportError(
        "episode_match_failed",
        `release season ${parsed.season} does not match requested season ${targetSeason}`,
        false,
      ),
    )
  }

  if (targets.length === 1) {
    const target = targets[0]
    if (MULTI_EPISODE_RE.test(releaseTitle)) {
      return Effect.fail(
        mediaImportError(
          "episode_match_failed",
          "single-episode import release title contains multiple episodes",
          false,
        ),
      )
    }
    if (SPLIT_EPISODE_RE.test(releaseTitle)) {
      return Effect.fail(
        mediaImportError(
          "episode_match_failed",
          "split-episode release titles require explicit manual handling",
          false,
        ),
      )
    }

    const absoluteMatches =
      target.episode.absoluteEpisodeNumber !== null &&
      parsed.absoluteEpisode !== null &&
      parsed.absoluteEpisode === target.episode.absoluteEpisodeNumber

    if (parsed.episode === null) {
      if (absoluteMatches) return Effect.void
      return Effect.fail(
        mediaImportError(
          "episode_match_failed",
          "single-episode import release title did not identify the requested episode",
          false,
        ),
      )
    }

    if (parsed.episode !== target.episode.episodeNumber) {
      return Effect.fail(
        mediaImportError(
          "episode_match_failed",
          `release episode ${parsed.episode} does not match requested episode ${target.episode.episodeNumber}`,
          false,
        ),
      )
    }

    if (
      target.episode.absoluteEpisodeNumber !== null &&
      parsed.absoluteEpisode !== null &&
      parsed.absoluteEpisode !== target.episode.absoluteEpisodeNumber
    ) {
      return Effect.fail(
        mediaImportError(
          "episode_match_failed",
          `release absolute episode ${parsed.absoluteEpisode} does not match requested absolute episode ${target.episode.absoluteEpisodeNumber}`,
          false,
        ),
      )
    }

    return Effect.void
  }

  if (SPLIT_EPISODE_RE.test(releaseTitle)) {
    return Effect.fail(
      mediaImportError(
        "episode_match_failed",
        "split-episode release titles require explicit manual handling",
        false,
      ),
    )
  }

  if (parsed.season === null) {
    return Effect.fail(
      mediaImportError(
        "episode_match_failed",
        "multi-episode import release title did not identify a season",
        false,
      ),
    )
  }

  const requestedEpisodes = targets.map((target) => target.episode.episodeNumber)
  const releaseEpisodes = extractMultiEpisodeNumbers(releaseTitle)
  if (releaseEpisodes.length > 0) {
    if (sameNumberSet(releaseEpisodes, requestedEpisodes)) return Effect.void
    return Effect.fail(
      mediaImportError(
        "episode_match_failed",
        `release episodes ${releaseEpisodes.join(", ")} do not match requested episodes ${requestedEpisodes.join(", ")}`,
        false,
      ),
    )
  }

  if (parsed.episode === null) return Effect.void

  return Effect.fail(
    mediaImportError(
      "episode_match_failed",
      "single-episode release title cannot satisfy a multi-episode import",
      false,
    ),
  )
}

function validateImportUpgrade(input: {
  readonly hasFile: boolean
  readonly existingQualityRank: number | null
  readonly existingFormatScore: number | null
  readonly qualityRank: number | null
  readonly formatScore: number
  readonly quality: ImportQualityState
}): Effect.Effect<void, MediaImportError> {
  if (!input.hasFile) return Effect.void

  if (!input.quality.upgradeAllowed) {
    return Effect.fail(
      mediaImportError("upgrade_rejected", "target quality profile does not allow upgrades", false),
    )
  }

  if (input.qualityRank !== null && input.existingQualityRank !== null) {
    if (input.qualityRank < input.existingQualityRank) {
      return Effect.fail(
        mediaImportError(
          "upgrade_rejected",
          `import quality rank ${input.qualityRank} is lower than existing rank ${input.existingQualityRank}`,
          false,
        ),
      )
    }
    if (input.qualityRank > input.existingQualityRank) return Effect.void
  }

  const existingFormatScore = input.existingFormatScore ?? 0
  if (input.formatScore <= existingFormatScore) {
    return Effect.fail(
      mediaImportError(
        "upgrade_rejected",
        `import format score ${input.formatScore} does not improve existing score ${existingFormatScore}`,
        false,
      ),
    )
  }

  if (
    input.quality.cutoffFormatScore > 0 &&
    existingFormatScore >= input.quality.cutoffFormatScore
  ) {
    return Effect.fail(
      mediaImportError(
        "upgrade_rejected",
        `existing format score ${existingFormatScore} already meets cutoff ${input.quality.cutoffFormatScore}`,
        false,
      ),
    )
  }

  if (input.formatScore < existingFormatScore + input.quality.minUpgradeFormatScore) {
    return Effect.fail(
      mediaImportError(
        "upgrade_rejected",
        `import format score ${input.formatScore} does not meet minimum upgrade score ${existingFormatScore + input.quality.minUpgradeFormatScore}`,
        false,
      ),
    )
  }

  return Effect.void
}

function movieDecision(
  db: Context.Tag.Service<typeof Db>,
  movieId: number,
  releaseTitle: string,
): Effect.Effect<DecisionQuality | null, SqlError> {
  return Effect.gen(function* () {
    const rows = yield* db
      .select({
        qualityRank: releaseDecisions.qualityRank,
        formatScore: releaseDecisions.formatScore,
      })
      .from(releaseDecisions)
      .where(
        and(
          eq(releaseDecisions.mediaId, movieId),
          eq(releaseDecisions.mediaType, "movie"),
          eq(releaseDecisions.candidateTitle, releaseTitle),
        ),
      )
      .limit(1)
    return rows[0] ?? null
  })
}

function tvDecision(
  db: Context.Tag.Service<typeof Db>,
  releaseTitle: string,
): Effect.Effect<DecisionQuality | null, SqlError> {
  return Effect.gen(function* () {
    const rows = yield* db
      .select({
        qualityRank: releaseDecisions.qualityRank,
        formatScore: releaseDecisions.formatScore,
      })
      .from(releaseDecisions)
      .where(eq(releaseDecisions.candidateTitle, releaseTitle))
      .limit(1)
    return rows[0] ?? null
  })
}

function upsertMediaFile(
  db: Context.Tag.Service<typeof Db>,
  input: {
    readonly mediaKind: "movie" | "episode"
    readonly mediaId: number
    readonly path: string
    readonly sourcePath: string
    readonly sizeBytes: number
    readonly qualityName: QualityName
    readonly qualityRank: number | null
    readonly formatScore: number
  },
): Effect.Effect<void, SqlError> {
  const now = new Date()
  return db
    .insert(mediaFiles)
    .values({
      mediaKind: input.mediaKind,
      mediaId: input.mediaId,
      path: input.path,
      sourcePath: input.sourcePath,
      sizeBytes: input.sizeBytes,
      qualityName: input.qualityName,
      qualityRank: input.qualityRank,
      formatScore: input.formatScore,
      importedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [mediaFiles.mediaKind, mediaFiles.mediaId],
      set: {
        path: input.path,
        sourcePath: input.sourcePath,
        sizeBytes: input.sizeBytes,
        qualityName: input.qualityName,
        qualityRank: input.qualityRank,
        formatScore: input.formatScore,
        importedAt: now,
        updatedAt: now,
      },
    })
    .pipe(Effect.asVoid)
}

function collectMediaFiles(
  sourcePath: string | null,
): Effect.Effect<ReadonlyArray<MediaFileCandidate>, MediaImportError> {
  if (sourcePath === null || sourcePath.trim().length === 0) {
    return Effect.fail(
      mediaImportError(
        "missing_output_path",
        "completed download did not expose an output path",
        true,
      ),
    )
  }

  const normalizedSource = sourcePath.trim()
  return Effect.tryPromise({
    try: async () => {
      const sourceStats = await stat(normalizedSource)

      if (sourceStats.isFile()) {
        if (!isVideoFile(normalizedSource)) return []
        return [
          {
            path: normalizedSource,
            extension: path.extname(normalizedSource).toLowerCase(),
            sizeBytes: sourceStats.size,
          },
        ]
      }

      if (!sourceStats.isDirectory()) return []

      const walk = async (dir: string): Promise<ReadonlyArray<MediaFileCandidate>> => {
        const entries = await readdir(dir, { withFileTypes: true })
        const nested = await Promise.all(
          entries.map(async (entry): Promise<ReadonlyArray<MediaFileCandidate>> => {
            const entryPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
              return walk(entryPath)
            }
            if (entry.isFile() && isVideoFile(entryPath)) {
              const entryStats = await stat(entryPath)
              return [
                {
                  path: entryPath,
                  extension: path.extname(entryPath).toLowerCase(),
                  sizeBytes: entryStats.size,
                },
              ]
            }
            return []
          }),
        )
        return nested.flat()
      }

      const files = await walk(normalizedSource)
      return files.toSorted(compareBySizeDesc)
    },
    catch: (error) => {
      if (nodeCode(error) === "ENOENT") {
        return mediaImportError(
          "source_not_found",
          `download output path does not exist: ${normalizedSource}`,
          true,
        )
      }
      return mediaImportError(
        "file_operation_failed",
        `failed to inspect download output: ${errorMessage(error)}`,
        true,
      )
    },
  }).pipe(
    Effect.flatMap((files) =>
      files.length > 0
        ? Effect.succeed(files)
        : Effect.fail(
            mediaImportError(
              "no_media_files",
              `download output contained no importable media files: ${normalizedSource}`,
              false,
            ),
          ),
    ),
  )
}

function candidateFromPath(filePath: string): Effect.Effect<MediaFileCandidate, MediaImportError> {
  return Effect.tryPromise({
    try: async () => {
      const fileStats = await stat(filePath)
      if (!fileStats.isFile()) {
        throw Object.assign(new Error(`not a file: ${filePath}`), { code: "ENOTFILE" })
      }
      return {
        path: filePath,
        extension: path.extname(filePath).toLowerCase(),
        sizeBytes: fileStats.size,
      }
    },
    catch: (error) => {
      if (nodeCode(error) === "ENOENT") {
        return mediaImportError("source_not_found", `media file does not exist: ${filePath}`, true)
      }
      return mediaImportError(
        "file_operation_failed",
        `failed to inspect media file: ${errorMessage(error)}`,
        true,
      )
    },
  })
}

function targetExists(targetPath: string): Promise<boolean> {
  return access(targetPath, constants.F_OK).then(
    () => true,
    () => false,
  )
}

function transferFile(
  sourcePath: string,
  targetPath: string,
  mode: FileHandlingMode,
): Effect.Effect<void, MediaImportError> {
  return Effect.tryPromise({
    try: async () => {
      if (path.resolve(sourcePath) === path.resolve(targetPath)) return
      await mkdir(path.dirname(targetPath), { recursive: true })
      if (await targetExists(targetPath)) return

      if (mode === "copy") {
        await copyFile(sourcePath, targetPath)
        return
      }

      if (mode === "hardlink") {
        await link(sourcePath, targetPath)
        return
      }

      try {
        await rename(sourcePath, targetPath)
      } catch (error) {
        if (nodeCode(error) !== "EXDEV") throw error
        await copyFile(sourcePath, targetPath)
        await unlink(sourcePath)
      }
    },
    catch: (error) =>
      mediaImportError(
        "file_operation_failed",
        `failed to ${mode} media file: ${errorMessage(error)}`,
        true,
      ),
  })
}

function renameMediaFile(
  sourcePath: string,
  targetPath: string,
): Effect.Effect<void, MediaImportError> {
  return Effect.tryPromise({
    try: async () => {
      if (path.resolve(sourcePath) === path.resolve(targetPath)) return
      await mkdir(path.dirname(targetPath), { recursive: true })
      if (await targetExists(targetPath)) {
        throw new Error(`target already exists: ${targetPath}`)
      }

      try {
        await rename(sourcePath, targetPath)
      } catch (error) {
        if (nodeCode(error) !== "EXDEV") throw error
        await copyFile(sourcePath, targetPath)
        await unlink(sourcePath)
      }
    },
    catch: (error) =>
      mediaImportError(
        "file_operation_failed",
        `failed to rename media file: ${errorMessage(error)}`,
        true,
      ),
  })
}

function recordRenamedMediaFile(
  db: Context.Tag.Service<typeof Db>,
  input: {
    readonly mediaKind: "movie" | "episode"
    readonly mediaId: number
    readonly currentPath: string
    readonly targetPath: string
    readonly sizeBytes: number
    readonly qualityName: QualityName
    readonly qualityRank: number | null
    readonly formatScore: number
  },
): Effect.Effect<void, SqlError> {
  return Effect.gen(function* () {
    const now = new Date()
    const rows = yield* db
      .select({ id: mediaFiles.id })
      .from(mediaFiles)
      .where(and(eq(mediaFiles.mediaKind, input.mediaKind), eq(mediaFiles.mediaId, input.mediaId)))
      .limit(1)

    if (rows[0]) {
      yield* db
        .update(mediaFiles)
        .set({
          path: input.targetPath,
          sizeBytes: input.sizeBytes,
          qualityName: input.qualityName,
          qualityRank: input.qualityRank,
          formatScore: input.formatScore,
          updatedAt: now,
        })
        .where(eq(mediaFiles.id, rows[0].id))
      return
    }

    yield* db.insert(mediaFiles).values({
      mediaKind: input.mediaKind,
      mediaId: input.mediaId,
      path: input.targetPath,
      sourcePath: input.currentPath,
      sizeBytes: input.sizeBytes,
      qualityName: input.qualityName,
      qualityRank: input.qualityRank,
      formatScore: input.formatScore,
      importedAt: now,
      updatedAt: now,
    })
  })
}

function selectEpisodeFiles(
  targets: ReadonlyArray<{
    readonly episode: typeof episodes.$inferSelect
    readonly season: typeof seasons.$inferSelect
    readonly series: typeof series.$inferSelect
  }>,
  candidates: ReadonlyArray<MediaFileCandidate>,
): Effect.Effect<ReadonlyArray<EpisodeImportTarget>, MediaImportError> {
  const sortedTargets = targets.toSorted(
    (a, b) =>
      a.season.seasonNumber - b.season.seasonNumber ||
      a.episode.episodeNumber - b.episode.episodeNumber,
  )
  const sortedCandidates = candidates.toSorted((a, b) => a.path.localeCompare(b.path))
  const used = new Set<string>()
  const matched: Array<EpisodeImportTarget> = []
  const targetKeys = new Set(
    sortedTargets.map((target) => `${target.season.seasonNumber}:${target.episode.episodeNumber}`),
  )
  const keyedCandidates = sortedCandidates.map((candidate) => ({
    candidate,
    key: episodeKeyFromPath(candidate.path),
  }))

  for (const target of sortedTargets) {
    const match = keyedCandidates.find((item) => {
      if (used.has(item.candidate.path)) return false
      const key = item.key
      return (
        key !== null &&
        key.season === target.season.seasonNumber &&
        key.episode === target.episode.episodeNumber
      )
    })
    if (match) {
      used.add(match.candidate.path)
      matched.push({ ...target, candidate: match.candidate })
    }
  }

  if (matched.length === sortedTargets.length) return Effect.succeed(matched)

  const unmatchedKnownKey = keyedCandidates.find((item) => {
    if (item.key === null) return false
    return !targetKeys.has(`${item.key.season}:${item.key.episode}`)
  })
  const knownMismatch = unmatchedKnownKey?.key
  if (knownMismatch) {
    return Effect.fail(
      mediaImportError(
        "episode_match_failed",
        `download file episode S${pad2(knownMismatch.season)}E${pad2(knownMismatch.episode)} does not match requested episodes`,
        false,
      ),
    )
  }

  if (keyedCandidates.some((item) => item.key !== null)) {
    return Effect.fail(
      mediaImportError(
        "episode_match_failed",
        "could not match every keyed download file to the requested episodes",
        false,
      ),
    )
  }

  if (sortedTargets.length === 1) {
    return Effect.succeed([{ ...sortedTargets[0], candidate: candidates[0] }])
  }

  if (sortedCandidates.length === sortedTargets.length) {
    return Effect.succeed(
      sortedTargets.map((target, index) => ({
        episode: target.episode,
        season: target.season,
        series: target.series,
        candidate: sortedCandidates[index],
      })),
    )
  }

  return Effect.fail(
    mediaImportError(
      "episode_match_failed",
      "could not match completed download files to the requested episodes",
      false,
    ),
  )
}

function targetMoviePath(
  movie: typeof movies.$inferSelect,
  namingConvention: string,
  releaseTitle: string,
  qualityName: QualityName,
  sourceFile: MediaFileCandidate,
): Effect.Effect<string, MediaImportError> {
  if (movie.rootFolderPath === null) {
    return Effect.fail(
      mediaImportError("root_folder_missing", `movie has no root folder: ${movie.title}`, false),
    )
  }

  const titleYear = movie.year ? `${movie.title} (${movie.year})` : movie.title
  const folderName = safeSegment(titleYear, `movie-${movie.id}`)
  const baseName = renderNamingConvention(namingConvention, {
    Title: movie.title,
    Year: movie.year ? String(movie.year) : "",
    Quality: qualityName,
    ReleaseTitle: releaseTitle,
  })
  const fileName = safeSegment(ensureQualityInName(baseName, qualityName), folderName)
  return Effect.succeed(
    path.join(movie.rootFolderPath, folderName, `${fileName}${sourceFile.extension}`),
  )
}

function targetEpisodePath(
  target: Omit<EpisodeImportTarget, "candidate">,
  qualityName: QualityName,
  sourceFile: MediaFileCandidate,
): Effect.Effect<string, MediaImportError> {
  if (target.series.rootFolderPath === null) {
    return Effect.fail(
      mediaImportError(
        "root_folder_missing",
        `series has no root folder: ${target.series.title}`,
        false,
      ),
    )
  }

  const seriesFolder = safeSegment(target.series.title, `series-${target.series.id}`)
  const seasonFolder = `Season ${pad2(target.season.seasonNumber)}`
  const episodeName = safeSegment(target.episode.title, `episode-${target.episode.id}`)
  const fileBase = safeSegment(
    `${seriesFolder} - S${pad2(target.season.seasonNumber)}E${pad2(
      target.episode.episodeNumber,
    )} - ${episodeName} - ${qualityName}`,
    `episode-${target.episode.id}`,
  )
  const targetDir = target.series.seasonFolder
    ? path.join(target.series.rootFolderPath, seriesFolder, seasonFolder)
    : path.join(target.series.rootFolderPath, seriesFolder)
  return Effect.succeed(path.join(targetDir, `${fileBase}${sourceFile.extension}`))
}

export const MediaImportServiceLive = Layer.effect(
  MediaImportService,
  Effect.gen(function* () {
    const db = yield* Db
    const settings = yield* SettingsService
    const titleParser = yield* TitleParserService

    const parseQuality = (releaseTitle: string): Effect.Effect<QualityName, never> =>
      titleParser.parse(releaseTitle).pipe(
        Effect.map((parsed) => parsed.qualityName ?? "Unknown"),
        Effect.catchAll(() => Effect.succeed("Unknown" as const)),
      )
    const parseImportReleaseTitle = (releaseTitle: string) =>
      titleParser
        .parse(releaseTitle)
        .pipe(
          Effect.mapError((error) =>
            mediaImportError(
              "media_mismatch",
              `could not parse import release title "${releaseTitle}": ${error.message}`,
              false,
            ),
          ),
        )

    const loadHandling = () =>
      settings
        .get("media.fileHandling")
        .pipe(Effect.map((setting) => parseFileHandling(setting.value)))

    const loadNaming = () =>
      settings.get("media.namingConvention").pipe(Effect.map((setting) => setting.value))

    const importMovie = (input: MovieImportInput) =>
      Effect.gen(function* () {
        const movieRows = yield* db.select().from(movies).where(eq(movies.id, input.movieId))
        const movie = movieRows[0]
        if (!movie) return yield* new NotFoundError({ entity: "movie", id: input.movieId })

        const resolvedSourcePath = yield* resolveSourcePath(
          db,
          input.sourcePath,
          input.downloadClientId ?? null,
        )
        const parsed = yield* parseImportReleaseTitle(input.releaseTitle)
        yield* validateMovieRelease(movie, parsed)
        if (parsed.qualityName === null) {
          return yield* mediaImportError(
            "quality_not_allowed",
            `could not determine import quality for "${input.releaseTitle}"`,
            false,
          )
        }

        const decision = yield* movieDecision(db, movie.id, input.releaseTitle)
        const quality = yield* loadImportQualityState(
          db,
          movie.qualityProfileId,
          parsed.qualityName,
        )
        const qualityName = parsed.qualityName
        const qualityRank = decision?.qualityRank ?? quality.qualityRank
        const formatScore = decision?.formatScore ?? 0
        yield* validateImportUpgrade({
          hasFile: movie.hasFile,
          existingQualityRank: movie.existingQualityRank,
          existingFormatScore: movie.existingFormatScore,
          qualityRank,
          formatScore,
          quality,
        })

        const [handling, namingConvention, candidates] = yield* Effect.all([
          loadHandling(),
          loadNaming(),
          collectMediaFiles(resolvedSourcePath),
        ])
        const candidate = candidates.toSorted(compareBySizeDesc)[0]
        const targetPath = yield* targetMoviePath(
          movie,
          namingConvention,
          input.releaseTitle,
          qualityName,
          candidate,
        )

        yield* transferFile(candidate.path, targetPath, handling)

        yield* db
          .update(movies)
          .set({
            status: "available",
            hasFile: true,
            filePath: targetPath,
            existingQualityName: qualityName,
            existingQualityRank: qualityRank,
            existingFormatScore: formatScore,
          })
          .where(eq(movies.id, movie.id))
        yield* upsertMediaFile(db, {
          mediaKind: "movie",
          mediaId: movie.id,
          path: targetPath,
          sourcePath: candidate.path,
          sizeBytes: candidate.sizeBytes,
          qualityName,
          qualityRank,
          formatScore,
        })
        yield* recordDomainHistory(db, {
          eventType: "imported",
          mediaKind: "movie",
          movieId: movie.id,
          releaseTitle: input.releaseTitle,
          downloadClientId: input.downloadClientId ?? null,
          title: `Imported ${movie.title}`,
          message: `Imported ${candidate.path} to ${targetPath}`,
          metadata: {
            sourcePath: candidate.path,
            targetPath,
            sizeBytes: candidate.sizeBytes,
            qualityName,
            qualityRank,
            formatScore,
          },
        })

        return {
          mediaKind: "movie" as const,
          mediaId: movie.id,
          sourcePath: candidate.path,
          targetPath,
          sizeBytes: candidate.sizeBytes,
          qualityName,
          qualityRank,
          formatScore,
        }
      })

    const importEpisodes = (input: EpisodeImportInput) =>
      Effect.gen(function* () {
        if (input.episodeIds.length === 0) {
          return yield* mediaImportError(
            "episode_match_failed",
            "episode import requires at least one episode id",
            false,
          )
        }

        const episodeRows = yield* db
          .select({ episode: episodes, season: seasons, series })
          .from(episodes)
          .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
          .innerJoin(series, eq(seasons.seriesId, series.id))
          .where(and(eq(series.id, input.seriesId), inArray(episodes.id, [...input.episodeIds])))
          .orderBy(asc(seasons.seasonNumber), asc(episodes.episodeNumber))

        if (episodeRows.length !== input.episodeIds.length) {
          const foundIds = new Set(episodeRows.map((row) => row.episode.id))
          const missingId = input.episodeIds.find((id) => !foundIds.has(id)) ?? input.episodeIds[0]
          return yield* new NotFoundError({ entity: "episode", id: missingId })
        }

        const resolvedSourcePath = yield* resolveSourcePath(
          db,
          input.sourcePath,
          input.downloadClientId ?? null,
        )
        const parsed = yield* parseImportReleaseTitle(input.releaseTitle)
        yield* validateEpisodeRelease(input.releaseTitle, parsed, episodeRows)
        if (parsed.qualityName === null) {
          return yield* mediaImportError(
            "quality_not_allowed",
            `could not determine import quality for "${input.releaseTitle}"`,
            false,
          )
        }

        const [handling, candidates] = yield* Effect.all([
          loadHandling(),
          collectMediaFiles(resolvedSourcePath),
        ])
        const targets = yield* selectEpisodeFiles(episodeRows, candidates)
        const decision = yield* tvDecision(db, input.releaseTitle)
        const profileId = episodeRows[0]?.series.qualityProfileId ?? null
        const quality = yield* loadImportQualityState(db, profileId, parsed.qualityName)
        const qualityName = parsed.qualityName
        const qualityRank = decision?.qualityRank ?? quality.qualityRank
        const formatScore = decision?.formatScore ?? 0
        const results: Array<MediaImportResult> = []

        for (const target of targets) {
          yield* validateImportUpgrade({
            hasFile: target.episode.hasFile,
            existingQualityRank: target.episode.existingQualityRank,
            existingFormatScore: target.episode.existingFormatScore,
            qualityRank,
            formatScore,
            quality,
          })
        }

        for (const target of targets) {
          const targetPath = yield* targetEpisodePath(target, qualityName, target.candidate)
          yield* transferFile(target.candidate.path, targetPath, handling)
          yield* db
            .update(episodes)
            .set({
              hasFile: true,
              filePath: targetPath,
              existingQualityName: qualityName,
              existingQualityRank: qualityRank,
              existingFormatScore: formatScore,
            })
            .where(eq(episodes.id, target.episode.id))
          yield* upsertMediaFile(db, {
            mediaKind: "episode",
            mediaId: target.episode.id,
            path: targetPath,
            sourcePath: target.candidate.path,
            sizeBytes: target.candidate.sizeBytes,
            qualityName,
            qualityRank,
            formatScore,
          })
          yield* recordDomainHistory(db, {
            eventType: "imported",
            mediaKind: "episode",
            seriesId: target.series.id,
            seasonId: target.season.id,
            episodeId: target.episode.id,
            releaseTitle: input.releaseTitle,
            downloadClientId: input.downloadClientId ?? null,
            title: `Imported ${target.series.title} S${pad2(target.season.seasonNumber)}E${pad2(target.episode.episodeNumber)}`,
            message: `Imported ${target.candidate.path} to ${targetPath}`,
            metadata: {
              sourcePath: target.candidate.path,
              targetPath,
              sizeBytes: target.candidate.sizeBytes,
              qualityName,
              qualityRank,
              formatScore,
            },
          })

          results.push({
            mediaKind: "episode",
            mediaId: target.episode.id,
            sourcePath: target.candidate.path,
            targetPath,
            sizeBytes: target.candidate.sizeBytes,
            qualityName,
            qualityRank,
            formatScore,
          })
        }

        return results
      })

    const manualImportMovie = (input: ManualMovieImportInput) =>
      importMovie({
        movieId: input.movieId,
        sourcePath: input.sourcePath,
        releaseTitle: input.releaseTitle?.trim() || releaseTitleFromPath(input.sourcePath),
        downloadClientId: null,
      })

    const manualImportEpisodes = (input: ManualEpisodeImportInput) =>
      importEpisodes({
        seriesId: input.seriesId,
        episodeIds: input.episodeIds,
        sourcePath: input.sourcePath,
        releaseTitle: input.releaseTitle?.trim() || releaseTitleFromPath(input.sourcePath),
        downloadClientId: null,
      })

    const listRemotePathMappings = () =>
      db.select().from(remotePathMappings).orderBy(asc(remotePathMappings.remotePath))

    const addRemotePathMapping = (input: RemotePathMappingInput) =>
      Effect.gen(function* () {
        const values = yield* validateRemotePathMappingInput(input)
        const rows = yield* db.insert(remotePathMappings).values(values).returning()
        return rows[0]
      })

    const updateRemotePathMapping = (id: number, input: RemotePathMappingInput) =>
      Effect.gen(function* () {
        const values = yield* validateRemotePathMappingInput(input)
        const rows = yield* db
          .update(remotePathMappings)
          .set({
            downloadClientId: values.downloadClientId,
            remotePath: values.remotePath,
            localPath: values.localPath,
            updatedAt: new Date(),
          })
          .where(eq(remotePathMappings.id, id))
          .returning()
        if (rows.length === 0)
          return yield* new NotFoundError({ entity: "remote_path_mapping", id })
        return rows[0]
      })

    const removeRemotePathMapping = (id: number) =>
      Effect.gen(function* () {
        const rows = yield* db
          .delete(remotePathMappings)
          .where(eq(remotePathMappings.id, id))
          .returning({ id: remotePathMappings.id })
        if (rows.length === 0)
          return yield* new NotFoundError({ entity: "remote_path_mapping", id })
      })

    const qualityForExisting = (
      qualityName: string | null,
      releaseTitle: string,
    ): Effect.Effect<QualityName, never> => {
      const parsed = qualityName ? parseQualityName(qualityName) : null
      return parsed ? Effect.succeed(parsed) : parseQuality(releaseTitle)
    }

    const scanLibraries = (): Effect.Effect<LibraryScanResult, MediaImportFailure> =>
      Effect.gen(function* () {
        const movieRows = yield* db.select().from(movies)
        const seriesRows = yield* db.select().from(series)
        let moviesImported = 0
        let episodesImported = 0

        for (const movie of movieRows) {
          if (movie.rootFolderPath === null) continue
          const movieFolder = path.join(
            movie.rootFolderPath,
            safeSegment(
              movie.year ? `${movie.title} (${movie.year})` : movie.title,
              `movie-${movie.id}`,
            ),
          )
          const candidates = yield* collectMediaFiles(movieFolder).pipe(
            Effect.catchIf(
              (error) => error.reason === "source_not_found" || error.reason === "no_media_files",
              () => Effect.succeed([] as ReadonlyArray<MediaFileCandidate>),
            ),
          )
          const candidate = candidates.toSorted(compareBySizeDesc)[0]
          if (!candidate) continue
          const releaseTitle = path.basename(candidate.path)
          const qualityName = yield* parseQuality(releaseTitle)
          const qualityRank = yield* qualityRankFallback(db, movie.qualityProfileId, qualityName)
          yield* db
            .update(movies)
            .set({
              status: "available",
              hasFile: true,
              filePath: candidate.path,
              existingQualityName: qualityName,
              existingQualityRank: qualityRank,
              existingFormatScore: 0,
            })
            .where(eq(movies.id, movie.id))
          yield* upsertMediaFile(db, {
            mediaKind: "movie",
            mediaId: movie.id,
            path: candidate.path,
            sourcePath: candidate.path,
            sizeBytes: candidate.sizeBytes,
            qualityName,
            qualityRank,
            formatScore: 0,
          })
          yield* recordDomainHistory(db, {
            eventType: "imported",
            mediaKind: "movie",
            movieId: movie.id,
            releaseTitle,
            title: `Imported ${movie.title}`,
            message: `Indexed existing library file ${candidate.path}`,
            metadata: {
              sourcePath: candidate.path,
              targetPath: candidate.path,
              sizeBytes: candidate.sizeBytes,
              qualityName,
              qualityRank,
              formatScore: 0,
              source: "library_scan",
            },
          })
          moviesImported += 1
        }

        for (const show of seriesRows) {
          if (show.rootFolderPath === null) continue
          const showFolder = path.join(
            show.rootFolderPath,
            safeSegment(show.title, `series-${show.id}`),
          )
          const candidates = yield* collectMediaFiles(showFolder).pipe(
            Effect.catchIf(
              (error) => error.reason === "source_not_found" || error.reason === "no_media_files",
              () => Effect.succeed([] as ReadonlyArray<MediaFileCandidate>),
            ),
          )
          if (candidates.length === 0) continue
          const episodeRows = yield* db
            .select({ episode: episodes, season: seasons })
            .from(episodes)
            .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
            .where(eq(seasons.seriesId, show.id))
          const episodeByKey = new Map(
            episodeRows.map((row) => [
              `${row.season.seasonNumber}:${row.episode.episodeNumber}`,
              row,
            ]),
          )
          const importedEpisodeIds = new Set<number>()
          for (const candidate of candidates) {
            const key = episodeKeyFromPath(candidate.path)
            if (key === null) continue
            const row = episodeByKey.get(`${key.season}:${key.episode}`)
            if (!row || importedEpisodeIds.has(row.episode.id)) continue
            const releaseTitle = path.basename(candidate.path)
            const qualityName = yield* parseQuality(releaseTitle)
            const qualityRank = yield* qualityRankFallback(db, show.qualityProfileId, qualityName)
            yield* db
              .update(episodes)
              .set({
                hasFile: true,
                filePath: candidate.path,
                existingQualityName: qualityName,
                existingQualityRank: qualityRank,
                existingFormatScore: 0,
              })
              .where(eq(episodes.id, row.episode.id))
            yield* upsertMediaFile(db, {
              mediaKind: "episode",
              mediaId: row.episode.id,
              path: candidate.path,
              sourcePath: candidate.path,
              sizeBytes: candidate.sizeBytes,
              qualityName,
              qualityRank,
              formatScore: 0,
            })
            yield* recordDomainHistory(db, {
              eventType: "imported",
              mediaKind: "episode",
              seriesId: show.id,
              seasonId: row.season.id,
              episodeId: row.episode.id,
              releaseTitle,
              title: `Imported ${show.title} S${pad2(row.season.seasonNumber)}E${pad2(row.episode.episodeNumber)}`,
              message: `Indexed existing library file ${candidate.path}`,
              metadata: {
                sourcePath: candidate.path,
                targetPath: candidate.path,
                sizeBytes: candidate.sizeBytes,
                qualityName,
                qualityRank,
                formatScore: 0,
                source: "library_scan",
              },
            })
            importedEpisodeIds.add(row.episode.id)
            episodesImported += 1
          }
        }

        return {
          moviesScanned: movieRows.length,
          moviesImported,
          seriesScanned: seriesRows.length,
          episodesImported,
        }
      })

    const previewMovieRename = (
      movieId: number,
    ): Effect.Effect<ReadonlyArray<RenamePlan>, MediaImportFailure> =>
      Effect.gen(function* () {
        const movieRows = yield* db.select().from(movies).where(eq(movies.id, movieId))
        const movie = movieRows[0]
        if (!movie) return yield* new NotFoundError({ entity: "movie", id: movieId })
        if (!movie.hasFile || movie.filePath === null) return []
        const candidate = yield* candidateFromPath(movie.filePath)
        const qualityName = yield* qualityForExisting(movie.existingQualityName, movie.filePath)
        const namingConvention = yield* loadNaming()
        const targetPath = yield* targetMoviePath(
          movie,
          namingConvention,
          path.basename(movie.filePath),
          qualityName,
          candidate,
        )
        return path.resolve(movie.filePath) === path.resolve(targetPath)
          ? []
          : [
              {
                mediaKind: "movie" as const,
                mediaId: movie.id,
                currentPath: movie.filePath,
                targetPath,
              },
            ]
      })

    const renameMovie = (
      movieId: number,
    ): Effect.Effect<ReadonlyArray<RenamePlan>, MediaImportFailure> =>
      Effect.gen(function* () {
        const plans = yield* previewMovieRename(movieId)
        for (const plan of plans) {
          const before = yield* candidateFromPath(plan.currentPath)
          const movieRows = yield* db.select().from(movies).where(eq(movies.id, plan.mediaId))
          const movie = movieRows[0]
          if (!movie) return yield* new NotFoundError({ entity: "movie", id: plan.mediaId })
          const qualityName = yield* qualityForExisting(movie.existingQualityName, plan.currentPath)
          yield* renameMediaFile(plan.currentPath, plan.targetPath)
          yield* db
            .update(movies)
            .set({ filePath: plan.targetPath })
            .where(eq(movies.id, plan.mediaId))
          yield* recordRenamedMediaFile(db, {
            mediaKind: "movie",
            mediaId: plan.mediaId,
            currentPath: plan.currentPath,
            targetPath: plan.targetPath,
            sizeBytes: before.sizeBytes,
            qualityName,
            qualityRank: movie.existingQualityRank,
            formatScore: movie.existingFormatScore ?? 0,
          })
          yield* recordDomainHistory(db, {
            eventType: "renamed",
            mediaKind: "movie",
            movieId: plan.mediaId,
            title: `Renamed ${movie.title}`,
            message: `Renamed ${plan.currentPath} to ${plan.targetPath}`,
            metadata: {
              sourcePath: plan.currentPath,
              targetPath: plan.targetPath,
              sizeBytes: before.sizeBytes,
              qualityName,
              qualityRank: movie.existingQualityRank,
              formatScore: movie.existingFormatScore ?? 0,
            },
          })
        }
        return plans
      })

    const episodeRowsForRename = (seriesId: number) =>
      db
        .select({ episode: episodes, season: seasons, series })
        .from(episodes)
        .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
        .innerJoin(series, eq(seasons.seriesId, series.id))
        .where(and(eq(series.id, seriesId), eq(episodes.hasFile, true)))

    const previewSeriesRename = (
      seriesId: number,
    ): Effect.Effect<ReadonlyArray<RenamePlan>, MediaImportFailure> =>
      Effect.gen(function* () {
        const rows = yield* episodeRowsForRename(seriesId)
        if (rows.length === 0) {
          const exists = yield* db
            .select({ id: series.id })
            .from(series)
            .where(eq(series.id, seriesId))
          if (!exists[0]) return yield* new NotFoundError({ entity: "series", id: seriesId })
        }
        const plans: Array<RenamePlan> = []
        for (const row of rows) {
          if (row.episode.filePath === null) continue
          const candidate = yield* candidateFromPath(row.episode.filePath)
          const qualityName = yield* qualityForExisting(
            row.episode.existingQualityName,
            row.episode.filePath,
          )
          const targetPath = yield* targetEpisodePath(row, qualityName, candidate)
          if (path.resolve(row.episode.filePath) !== path.resolve(targetPath)) {
            plans.push({
              mediaKind: "episode",
              mediaId: row.episode.id,
              currentPath: row.episode.filePath,
              targetPath,
            })
          }
        }
        return plans
      })

    const renameSeries = (
      seriesId: number,
    ): Effect.Effect<ReadonlyArray<RenamePlan>, MediaImportFailure> =>
      Effect.gen(function* () {
        const plans = yield* previewSeriesRename(seriesId)
        for (const plan of plans) {
          const before = yield* candidateFromPath(plan.currentPath)
          const episodeRows = yield* db.select().from(episodes).where(eq(episodes.id, plan.mediaId))
          const episode = episodeRows[0]
          if (!episode) return yield* new NotFoundError({ entity: "episode", id: plan.mediaId })
          const qualityName = yield* qualityForExisting(
            episode.existingQualityName,
            plan.currentPath,
          )
          yield* renameMediaFile(plan.currentPath, plan.targetPath)
          yield* db
            .update(episodes)
            .set({ filePath: plan.targetPath })
            .where(eq(episodes.id, plan.mediaId))
          yield* recordRenamedMediaFile(db, {
            mediaKind: "episode",
            mediaId: plan.mediaId,
            currentPath: plan.currentPath,
            targetPath: plan.targetPath,
            sizeBytes: before.sizeBytes,
            qualityName,
            qualityRank: episode.existingQualityRank,
            formatScore: episode.existingFormatScore ?? 0,
          })
          const contextRows = yield* db
            .select({ episode: episodes, season: seasons, series })
            .from(episodes)
            .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
            .innerJoin(series, eq(seasons.seriesId, series.id))
            .where(eq(episodes.id, plan.mediaId))
            .limit(1)
          const row = contextRows[0]
          yield* recordDomainHistory(db, {
            eventType: "renamed",
            mediaKind: "episode",
            seriesId: row?.series.id ?? seriesId,
            seasonId: row?.season.id ?? episode.seasonId,
            episodeId: plan.mediaId,
            title: row
              ? `Renamed ${row.series.title} S${pad2(row.season.seasonNumber)}E${pad2(row.episode.episodeNumber)}`
              : `Renamed episode ${plan.mediaId}`,
            message: `Renamed ${plan.currentPath} to ${plan.targetPath}`,
            metadata: {
              sourcePath: plan.currentPath,
              targetPath: plan.targetPath,
              sizeBytes: before.sizeBytes,
              qualityName,
              qualityRank: episode.existingQualityRank,
              formatScore: episode.existingFormatScore ?? 0,
            },
          })
        }
        return plans
      })

    return {
      importMovie,
      importEpisodes,
      manualImportMovie,
      manualImportEpisodes,
      listRemotePathMappings,
      addRemotePathMapping,
      updateRemotePathMapping,
      removeRemotePathMapping,
      scanLibraries,
      previewMovieRename,
      renameMovie,
      previewSeriesRename,
      renameSeries,
    }
  }),
)
