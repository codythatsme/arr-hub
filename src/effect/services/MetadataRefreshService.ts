import { SqlError } from "@effect/sql/SqlError"
import { and, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { episodes, movies, seasons, series } from "#/db/schema"
import { TmdbClient } from "#/effect/services/TmdbClient"

import { MetadataError, NotFoundError } from "../errors"
import { Db } from "./Db"

export interface MetadataRefreshSummary {
  readonly refreshed: number
  readonly skipped: number
  readonly failed: number
}

export class MetadataRefreshService extends Context.Tag("@arr-hub/MetadataRefreshService")<
  MetadataRefreshService,
  {
    readonly refreshMovie: (
      id: number,
    ) => Effect.Effect<typeof movies.$inferSelect, MetadataError | NotFoundError | SqlError>
    readonly refreshSeries: (
      id: number,
    ) => Effect.Effect<typeof series.$inferSelect, MetadataError | NotFoundError | SqlError>
    readonly refreshAllMovies: () => Effect.Effect<MetadataRefreshSummary, SqlError>
    readonly refreshAllSeries: () => Effect.Effect<MetadataRefreshSummary, SqlError>
  }
>() {}

function parseDateOnly(value: string | null): Date | null {
  if (value === null || value.length === 0) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function mapTvStatus(status: string): "continuing" | "ended" | "wanted" {
  if (status === "Ended" || status === "Canceled") return "ended"
  if (
    status === "Returning Series" ||
    status === "In Production" ||
    status === "Planned" ||
    status === "Pilot"
  ) {
    return "continuing"
  }
  return "wanted"
}

export const MetadataRefreshServiceLive = Layer.effect(
  MetadataRefreshService,
  Effect.gen(function* () {
    const db = yield* Db
    const tmdb = yield* TmdbClient

    const refreshMovie = (id: number) =>
      Effect.gen(function* () {
        const rows = yield* db.select().from(movies).where(eq(movies.id, id)).limit(1)
        const existing = rows[0]
        if (!existing) {
          return yield* new NotFoundError({ entity: "movie", id })
        }

        const details = yield* tmdb.getMovie(existing.tmdbId)
        const [updated] = yield* db
          .update(movies)
          .set({
            imdbId: details.imdbId,
            title: details.title,
            originalTitle: details.originalTitle,
            year: details.year,
            releaseDate: parseDateOnly(details.releaseDate),
            overview: details.overview.length > 0 ? details.overview : null,
            posterPath: details.posterPath,
            genres: details.genres.map((genre) => genre.name).filter((name) => name.length > 0),
            runtimeMinutes: details.runtime,
            metadataRefreshedAt: new Date(),
          })
          .where(eq(movies.id, id))
          .returning()
        return updated
      })

    const refreshSeries = (id: number) =>
      Effect.gen(function* () {
        const rows = yield* db.select().from(series).where(eq(series.id, id)).limit(1)
        const existing = rows[0]
        if (!existing) {
          return yield* new NotFoundError({ entity: "series", id })
        }
        if (existing.tmdbId === null) {
          return yield* new MetadataError({
            provider: "tmdb",
            reason: "not_found",
            message: `series ${id} does not have a TMDB ID`,
            retryable: false,
          })
        }

        const details = yield* tmdb.getTvSeries(existing.tmdbId)
        const [updated] = yield* db
          .update(series)
          .set({
            tvdbId: details.tvdbId ?? existing.tvdbId,
            imdbId: details.imdbId,
            title: details.name,
            originalTitle: details.originalName,
            year: details.year,
            overview: details.overview.length > 0 ? details.overview : null,
            posterPath: details.posterPath,
            status: mapTvStatus(details.status),
            network: details.networks[0]?.name ?? null,
            genres: details.genres.map((genre) => genre.name).filter((name) => name.length > 0),
            runtimeMinutes: details.episodeRunTime[0] ?? null,
            seriesType: details.type.length > 0 ? details.type : null,
            metadataRefreshedAt: new Date(),
          })
          .where(eq(series.id, id))
          .returning()

        for (const seasonSummary of details.seasons) {
          const season = yield* tmdb.getTvSeason(details.id, seasonSummary.seasonNumber)
          const existingSeasonRows = yield* db
            .select()
            .from(seasons)
            .where(and(eq(seasons.seriesId, id), eq(seasons.seasonNumber, season.seasonNumber)))
            .limit(1)
          const seasonRow =
            existingSeasonRows[0] ??
            (yield* db
              .insert(seasons)
              .values({
                seriesId: id,
                tmdbId: season.id,
                seasonNumber: season.seasonNumber,
                monitored: existing.monitored,
              })
              .returning())[0]

          if (existingSeasonRows.length > 0) {
            yield* db.update(seasons).set({ tmdbId: season.id }).where(eq(seasons.id, seasonRow.id))
          }

          for (const episode of season.episodes) {
            const existingEpisodeRows = yield* db
              .select()
              .from(episodes)
              .where(eq(episodes.tmdbId, episode.id))
              .limit(1)
            const existingEpisode =
              existingEpisodeRows[0] ??
              (yield* db
                .select()
                .from(episodes)
                .where(
                  and(
                    eq(episodes.seasonId, seasonRow.id),
                    eq(episodes.episodeNumber, episode.episodeNumber),
                  ),
                )
                .limit(1))[0]

            if (existingEpisode) {
              yield* db
                .update(episodes)
                .set({
                  tmdbId: episode.id,
                  title:
                    episode.title.length > 0 ? episode.title : `Episode ${episode.episodeNumber}`,
                  airDate: parseDateOnly(episode.airDate),
                  overview: episode.overview.length > 0 ? episode.overview : null,
                  runtimeMinutes: episode.runtime,
                })
                .where(eq(episodes.id, existingEpisode.id))
              continue
            }

            yield* db.insert(episodes).values({
              seasonId: seasonRow.id,
              tvdbId: episode.id,
              tmdbId: episode.id,
              title: episode.title.length > 0 ? episode.title : `Episode ${episode.episodeNumber}`,
              episodeNumber: episode.episodeNumber,
              airDate: parseDateOnly(episode.airDate),
              overview: episode.overview.length > 0 ? episode.overview : null,
              runtimeMinutes: episode.runtime,
              monitored: seasonRow.monitored,
            })
          }
        }

        return updated
      })

    const refreshAllMovies = () =>
      Effect.gen(function* () {
        const rows = yield* db.select({ id: movies.id }).from(movies)
        let refreshed = 0
        let failed = 0
        for (const row of rows) {
          const ok = yield* refreshMovie(row.id).pipe(
            Effect.as(true),
            Effect.catchAll(() => Effect.succeed(false)),
          )
          if (ok) refreshed++
          else failed++
        }
        return { refreshed, skipped: 0, failed }
      })

    const refreshAllSeries = () =>
      Effect.gen(function* () {
        const rows = yield* db.select({ id: series.id, tmdbId: series.tmdbId }).from(series)
        let refreshed = 0
        let skipped = 0
        let failed = 0
        for (const row of rows) {
          if (row.tmdbId === null) {
            skipped++
            continue
          }
          const ok = yield* refreshSeries(row.id).pipe(
            Effect.as(true),
            Effect.catchAll(() => Effect.succeed(false)),
          )
          if (ok) refreshed++
          else failed++
        }
        return { refreshed, skipped, failed }
      })

    return {
      refreshMovie,
      refreshSeries,
      refreshAllMovies,
      refreshAllSeries,
    }
  }),
)
