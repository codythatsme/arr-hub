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
  releaseDecisions,
  remotePathMappings,
  seasons,
  series,
} from "#/db/schema"
import type { QualityName } from "#/effect/domain/quality"
import {
  MediaImportError,
  type MediaImportErrorReason,
  NotFoundError,
  type SettingsError,
} from "#/effect/errors"

import { Db } from "./Db"
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

type MediaImportFailure = MediaImportError | NotFoundError | SettingsError | SqlError

export class MediaImportService extends Context.Tag("@arr-hub/MediaImportService")<
  MediaImportService,
  {
    readonly importMovie: (
      input: MovieImportInput,
    ) => Effect.Effect<MediaImportResult, MediaImportFailure>
    readonly importEpisodes: (
      input: EpisodeImportInput,
    ) => Effect.Effect<ReadonlyArray<MediaImportResult>, MediaImportFailure>
  }
>() {}

const VIDEO_EXTENSIONS = new Set([".mkv", ".mp4", ".avi", ".mov", ".m4v", ".ts", ".wmv"])
const SAMPLE_TOKEN = /(?:^|[.\-_\s])sample(?:[.\-_\s]|$)/i
const SEASON_EPISODE = /S(\d{1,2})E(\d{1,3})/i
const SEASON_EPISODE_ALT = /(\d{1,2})x(\d{2,3})/i

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

  for (const target of sortedTargets) {
    const candidate = sortedCandidates.find((item) => {
      if (used.has(item.path)) return false
      const key = episodeKeyFromPath(item.path)
      return (
        key !== null &&
        key.season === target.season.seasonNumber &&
        key.episode === target.episode.episodeNumber
      )
    })
    if (candidate) {
      used.add(candidate.path)
      matched.push({ ...target, candidate })
    }
  }

  if (matched.length === sortedTargets.length) return Effect.succeed(matched)

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

    const loadHandling = () =>
      settings
        .get("media.fileHandling")
        .pipe(Effect.map((setting) => parseFileHandling(setting.value)))

    const loadNaming = () =>
      settings.get("media.namingConvention").pipe(Effect.map((setting) => setting.value))

    return {
      importMovie: (input) =>
        Effect.gen(function* () {
          const movieRows = yield* db.select().from(movies).where(eq(movies.id, input.movieId))
          const movie = movieRows[0]
          if (!movie) return yield* new NotFoundError({ entity: "movie", id: input.movieId })

          const resolvedSourcePath = yield* resolveSourcePath(
            db,
            input.sourcePath,
            input.downloadClientId ?? null,
          )
          const [handling, namingConvention, qualityName, candidates] = yield* Effect.all([
            loadHandling(),
            loadNaming(),
            parseQuality(input.releaseTitle),
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

          const decision = yield* movieDecision(db, movie.id, input.releaseTitle)
          const qualityRank =
            decision?.qualityRank ??
            (yield* qualityRankFallback(db, movie.qualityProfileId, qualityName))
          const formatScore = decision?.formatScore ?? 0

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
        }),

      importEpisodes: (input) =>
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
            const missingId =
              input.episodeIds.find((id) => !foundIds.has(id)) ?? input.episodeIds[0]
            return yield* new NotFoundError({ entity: "episode", id: missingId })
          }

          const resolvedSourcePath = yield* resolveSourcePath(
            db,
            input.sourcePath,
            input.downloadClientId ?? null,
          )
          const [handling, qualityName, candidates] = yield* Effect.all([
            loadHandling(),
            parseQuality(input.releaseTitle),
            collectMediaFiles(resolvedSourcePath),
          ])
          const targets = yield* selectEpisodeFiles(episodeRows, candidates)
          const decision = yield* tvDecision(db, input.releaseTitle)
          const profileId = episodeRows[0]?.series.qualityProfileId ?? null
          const qualityRank =
            decision?.qualityRank ?? (yield* qualityRankFallback(db, profileId, qualityName))
          const formatScore = decision?.formatScore ?? 0
          const results: Array<MediaImportResult> = []

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
        }),
    }
  }),
)
