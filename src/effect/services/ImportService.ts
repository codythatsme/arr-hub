import { SqlClient } from "@effect/sql"
import { SqlError } from "@effect/sql/SqlError"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { z } from "zod"

import { episodes, qualityProfiles, movies, series, seasons } from "#/db/schema"

import * as radarr from "../../lib/import/radarr-client"
import {
  posterOf,
  type RadarrMovie,
  type SonarrEpisode,
  type SonarrEpisodeFile,
  type SonarrSeries,
} from "../../lib/import/schemas"
import * as sonarr from "../../lib/import/sonarr-client"
import { ImportError } from "../errors"
import { Db } from "./Db"
import { OnboardingService } from "./OnboardingService"

// ── Types ──

export interface ImportResult {
  readonly imported: number
  readonly skipped: number
}

export interface ConnectionTestResult {
  readonly version: string
}

export interface ImportCredentials {
  readonly url: string
  readonly apiKey: string
}

// ── Service ──

export class ImportService extends Context.Tag("@arr-hub/ImportService")<
  ImportService,
  {
    readonly testRadarr: (
      input: ImportCredentials,
    ) => Effect.Effect<ConnectionTestResult, ImportError | SqlError>
    readonly testSonarr: (
      input: ImportCredentials,
    ) => Effect.Effect<ConnectionTestResult, ImportError | SqlError>
    readonly importFromRadarr: (
      input: ImportCredentials,
    ) => Effect.Effect<ImportResult, ImportError | SqlError>
    readonly importFromSonarr: (
      input: ImportCredentials,
    ) => Effect.Effect<ImportResult, ImportError | SqlError>
  }
>() {}

// ── Helpers ──

function toImportError(source: "radarr" | "sonarr", e: unknown): ImportError {
  if (e instanceof z.ZodError) {
    return new ImportError({
      source,
      reason: "invalid_response",
      message: `schema validation failed: ${e.issues.map((i) => i.message).join(", ")}`,
    })
  }
  if (e instanceof Error && e.name === "AbortError") {
    return new ImportError({
      source,
      reason: "connection_failed",
      message: "request timed out",
    })
  }
  const msg = e instanceof Error ? e.message : "unknown error"
  const isConnection = /HTTP \d{3}|fetch|network|ECONN|ENOTFOUND/i.test(msg)
  return new ImportError({
    source,
    reason: isConnection ? "connection_failed" : "invalid_response",
    message: msg,
  })
}

function mapSonarrStatus(status: string): "continuing" | "ended" | "wanted" | "available" {
  if (status === "continuing") return "continuing"
  if (status === "ended") return "ended"
  return "wanted"
}

function parseSonarrDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined || value.length === 0) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function fallbackEpisodeTvdbId(s: SonarrSeries, e: SonarrEpisode): number {
  if (typeof e.tvdbId === "number" && e.tvdbId > 0) return e.tvdbId
  return s.tvdbId * 100_000 + e.seasonNumber * 1_000 + e.episodeNumber
}

function combineRemotePath(root: string | undefined, relative: string | undefined): string | null {
  if (relative === undefined || relative.length === 0) return null
  if (root === undefined || root.length === 0) return relative
  return `${root.replace(/[\\/]+$/, "")}/${relative.replace(/^[\\/]+/, "")}`
}

function episodeFilePath(s: SonarrSeries, file: SonarrEpisodeFile | undefined): string | null {
  if (file === undefined) return null
  if (file.path !== undefined && file.path.length > 0) return file.path
  return combineRemotePath(s.path, file.relativePath)
}

function episodeFileQuality(file: SonarrEpisodeFile | undefined): string | null {
  return file?.quality?.quality?.name ?? null
}

interface SonarrSeriesImportPayload {
  readonly series: SonarrSeries
  readonly episodes: ReadonlyArray<SonarrEpisode>
  readonly episodeFiles: ReadonlyArray<SonarrEpisodeFile>
}

// ── Live implementation ──

export const ImportServiceLive = Layer.effect(
  ImportService,
  Effect.gen(function* () {
    const db = yield* Db
    const sql = yield* SqlClient.SqlClient
    const onboarding = yield* OnboardingService

    const assertSetupActive = (
      source: "radarr" | "sonarr",
    ): Effect.Effect<void, ImportError | SqlError> =>
      Effect.gen(function* () {
        const status = yield* onboarding.getStatus()
        if (status.completed) {
          return yield* new ImportError({
            source,
            reason: "setup_not_active",
            message: "library import is only available during setup",
          })
        }
      })

    const loadDefaultProfileId = (): Effect.Effect<number | null, SqlError> =>
      Effect.gen(function* () {
        const rows = yield* db
          .select({ id: qualityProfiles.id })
          .from(qualityProfiles)
          .where(eq(qualityProfiles.isDefault, true))
          .limit(1)
        return rows[0]?.id ?? null
      })

    const testRadarr = (input: ImportCredentials) =>
      Effect.gen(function* () {
        yield* assertSetupActive("radarr")
        return yield* Effect.tryPromise({
          try: () => radarr.testConnection(input.url, input.apiKey),
          catch: (e) => toImportError("radarr", e),
        })
      })

    const testSonarr = (input: ImportCredentials) =>
      Effect.gen(function* () {
        yield* assertSetupActive("sonarr")
        return yield* Effect.tryPromise({
          try: () => sonarr.testConnection(input.url, input.apiKey),
          catch: (e) => toImportError("sonarr", e),
        })
      })

    const insertRadarrMovie = (m: RadarrMovie, defaultProfileId: number | null) =>
      Effect.gen(function* () {
        const existing = yield* db
          .select({ id: movies.id })
          .from(movies)
          .where(eq(movies.tmdbId, m.tmdbId))
          .limit(1)
        if (existing.length > 0) return "skipped" as const
        yield* db.insert(movies).values({
          tmdbId: m.tmdbId,
          title: m.title,
          year: m.year ?? null,
          overview: m.overview ?? null,
          posterPath: posterOf(m.images),
          status: m.hasFile ? "available" : "wanted",
          qualityProfileId: defaultProfileId,
          rootFolderPath: m.path ?? null,
          monitored: m.monitored,
          hasFile: m.hasFile,
        })
        return "imported" as const
      })

    const fetchSonarrPayload = (s: SonarrSeries, input: ImportCredentials) =>
      Effect.gen(function* () {
        const [episodeList, episodeFileList] = yield* Effect.all([
          Effect.tryPromise({
            try: () => sonarr.fetchEpisodes(input.url, input.apiKey, s.id),
            catch: (e) => toImportError("sonarr", e),
          }),
          Effect.tryPromise({
            try: () => sonarr.fetchEpisodeFiles(input.url, input.apiKey, s.id),
            catch: (e) => toImportError("sonarr", e),
          }),
        ])
        return { series: s, episodes: episodeList, episodeFiles: episodeFileList }
      })

    const insertSonarrSeries = (
      payload: SonarrSeriesImportPayload,
      defaultProfileId: number | null,
    ) =>
      Effect.gen(function* () {
        const s = payload.series
        const existing = yield* db
          .select({ id: series.id })
          .from(series)
          .where(eq(series.tvdbId, s.tvdbId))
          .limit(1)
        if (existing.length > 0) return "skipped" as const
        const [row] = yield* db
          .insert(series)
          .values({
            tvdbId: s.tvdbId,
            title: s.title,
            year: s.year ?? null,
            overview: s.overview ?? null,
            posterPath: posterOf(s.images),
            status: mapSonarrStatus(s.status),
            network: s.network ?? null,
            rootFolderPath: s.path ?? null,
            monitored: s.monitored,
            qualityProfileId: defaultProfileId,
            seasonFolder: s.seasonFolder ?? true,
          })
          .returning({ id: series.id })
        const seasonNumbers = new Set([
          ...s.seasons.map((season) => season.seasonNumber),
          ...payload.episodes.map((episode) => episode.seasonNumber),
        ])
        const filesById = new Map(payload.episodeFiles.map((file) => [file.id, file] as const))

        for (const seasonNumber of [...seasonNumbers].toSorted((a, b) => a - b)) {
          const sourceSeason = s.seasons.find((season) => season.seasonNumber === seasonNumber)
          const [seasonRow] = yield* db
            .insert(seasons)
            .values({
              seriesId: row.id,
              seasonNumber,
              monitored: sourceSeason?.monitored ?? s.monitored,
            })
            .returning({ id: seasons.id })

          for (const episode of payload.episodes.filter((e) => e.seasonNumber === seasonNumber)) {
            const file =
              episode.episodeFileId === null || episode.episodeFileId === undefined
                ? undefined
                : filesById.get(episode.episodeFileId)
            yield* db.insert(episodes).values({
              seasonId: seasonRow.id,
              tvdbId: fallbackEpisodeTvdbId(s, episode),
              title:
                episode.title && episode.title.length > 0
                  ? episode.title
                  : `Episode ${episode.episodeNumber}`,
              episodeNumber: episode.episodeNumber,
              absoluteEpisodeNumber: episode.absoluteEpisodeNumber ?? null,
              airDate: parseSonarrDate(episode.airDateUtc ?? episode.airDate),
              overview: episode.overview ?? null,
              hasFile:
                episode.hasFile ??
                (episode.episodeFileId !== null && episode.episodeFileId !== undefined),
              filePath: episodeFilePath(s, file),
              monitored: episode.monitored,
              existingQualityName: episodeFileQuality(file),
            })
          }
        }
        return "imported" as const
      })

    const importFromRadarr = (input: ImportCredentials) =>
      Effect.gen(function* () {
        yield* assertSetupActive("radarr")
        const list = yield* Effect.tryPromise({
          try: () => radarr.fetchMovies(input.url, input.apiKey),
          catch: (e) => toImportError("radarr", e),
        })
        const defaultProfileId = yield* loadDefaultProfileId()

        const run = Effect.gen(function* () {
          let imported = 0
          let skipped = 0
          for (const movie of list) {
            const result = yield* insertRadarrMovie(movie, defaultProfileId)
            if (result === "imported") imported++
            else skipped++
          }
          return { imported, skipped } satisfies ImportResult
        })

        return yield* sql.withTransaction(run).pipe(
          Effect.mapError(
            (e) =>
              new ImportError({
                source: "radarr",
                reason: "transaction_failed",
                message: e.message,
              }),
          ),
        )
      })

    const importFromSonarr = (input: ImportCredentials) =>
      Effect.gen(function* () {
        yield* assertSetupActive("sonarr")
        const list = yield* Effect.tryPromise({
          try: () => sonarr.fetchSeries(input.url, input.apiKey),
          catch: (e) => toImportError("sonarr", e),
        })
        const payloads = yield* Effect.all(
          list.map((s) => fetchSonarrPayload(s, input)),
          {
            concurrency: 2,
          },
        )
        const defaultProfileId = yield* loadDefaultProfileId()

        const run = Effect.gen(function* () {
          let imported = 0
          let skipped = 0
          for (const payload of payloads) {
            const result = yield* insertSonarrSeries(payload, defaultProfileId)
            if (result === "imported") imported++
            else skipped++
          }
          return { imported, skipped } satisfies ImportResult
        })

        return yield* sql.withTransaction(run).pipe(
          Effect.mapError(
            (e) =>
              new ImportError({
                source: "sonarr",
                reason: "transaction_failed",
                message: e.message,
              }),
          ),
        )
      })

    return {
      testRadarr,
      testSonarr,
      importFromRadarr,
      importFromSonarr,
    }
  }),
)
