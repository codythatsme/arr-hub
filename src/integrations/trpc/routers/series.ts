import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import type { TmdbTvSeason, TmdbTvSeriesDetails } from "#/effect/domain/tmdb"
import { MetadataError } from "#/effect/errors"
import { AcquisitionPipeline } from "#/effect/services/AcquisitionPipeline"
import { SeriesService } from "#/effect/services/SeriesService"
import { TmdbClient } from "#/effect/services/TmdbClient"

import { authedProcedure, runEffect } from "../init"

const episodeInputSchema = z.object({
  tvdbId: z.number(),
  tmdbId: z.number().nullish(),
  title: z.string(),
  episodeNumber: z.number(),
  absoluteEpisodeNumber: z.number().nullish(),
  airDate: z.date().nullish(),
  overview: z.string().nullish(),
  runtimeMinutes: z.number().nullish(),
  hasFile: z.boolean().optional(),
  filePath: z.string().nullish(),
  monitored: z.boolean().optional(),
})

const seasonInputSchema = z.object({
  seasonNumber: z.number(),
  tmdbId: z.number().nullish(),
  monitored: z.boolean().optional(),
  episodes: z.array(episodeInputSchema).optional(),
})

const seriesInputSchema = z.object({
  tvdbId: z.number(),
  tmdbId: z.number().nullish(),
  imdbId: z.string().nullish(),
  title: z.string(),
  originalTitle: z.string().nullish(),
  year: z.number().nullish(),
  overview: z.string().nullish(),
  posterPath: z.string().nullish(),
  status: z.enum(["continuing", "ended", "wanted", "available"]).optional(),
  network: z.string().nullish(),
  genres: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  runtimeMinutes: z.number().nullish(),
  seriesType: z.string().nullish(),
  certification: z.string().nullish(),
  rootFolderPath: z.string().nullish(),
  monitored: z.boolean().optional(),
  qualityProfileId: z.number().nullish(),
  seasonFolder: z.boolean().optional(),
  metadataRefreshedAt: z.date().nullish(),
  seasons: z.array(seasonInputSchema).optional(),
})

const seriesUpdateSchema = z.object({
  title: z.string().optional(),
  tmdbId: z.number().nullish(),
  imdbId: z.string().nullish(),
  originalTitle: z.string().nullish(),
  year: z.number().nullish(),
  overview: z.string().nullish(),
  posterPath: z.string().nullish(),
  status: z.enum(["continuing", "ended", "wanted", "available"]).optional(),
  network: z.string().nullish(),
  genres: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  runtimeMinutes: z.number().nullish(),
  seriesType: z.string().nullish(),
  certification: z.string().nullish(),
  rootFolderPath: z.string().nullish(),
  monitored: z.boolean().optional(),
  qualityProfileId: z.number().nullish(),
  seasonFolder: z.boolean().optional(),
  metadataRefreshedAt: z.date().nullish(),
})

const seriesFiltersSchema = z
  .object({
    status: z.enum(["continuing", "ended", "wanted", "available"]).optional(),
    monitored: z.boolean().optional(),
  })
  .nullish()

const addFromTmdbSchema = z.object({
  tmdbId: z.number().int().positive(),
  rootFolderPath: z.string().nullish(),
  monitored: z.boolean().optional(),
  qualityProfileId: z.number().nullish(),
  seasonFolder: z.boolean().optional(),
})

function parseAirDate(value: string | null): Date | null {
  if (value === null || value.length === 0) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function mapTmdbTvStatus(status: string): "continuing" | "ended" | "wanted" {
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

function buildMetadataSeriesInput(
  details: TmdbTvSeriesDetails,
  hydratedSeasons: ReadonlyArray<TmdbTvSeason>,
  input: z.infer<typeof addFromTmdbSchema>,
) {
  const network = details.networks[0]?.name ?? null
  const runtimeMinutes = details.episodeRunTime[0] ?? null
  return {
    tvdbId: details.tvdbId ?? 0,
    tmdbId: details.id,
    imdbId: details.imdbId,
    title: details.name,
    originalTitle: details.originalName,
    year: details.year,
    overview: details.overview.length > 0 ? details.overview : null,
    posterPath: details.posterPath,
    status: mapTmdbTvStatus(details.status),
    network,
    genres: details.genres.map((genre) => genre.name).filter((name) => name.length > 0),
    runtimeMinutes,
    seriesType: details.type.length > 0 ? details.type : null,
    rootFolderPath: input.rootFolderPath ?? null,
    monitored: input.monitored ?? true,
    qualityProfileId: input.qualityProfileId ?? null,
    seasonFolder: input.seasonFolder ?? true,
    metadataRefreshedAt: new Date(),
    seasons: hydratedSeasons.map((season) => ({
      tmdbId: season.id,
      seasonNumber: season.seasonNumber,
      monitored: input.monitored ?? true,
      episodes: season.episodes.map((episode) => ({
        tvdbId: episode.id,
        tmdbId: episode.id,
        title: episode.title.length > 0 ? episode.title : `Episode ${episode.episodeNumber}`,
        episodeNumber: episode.episodeNumber,
        airDate: parseAirDate(episode.airDate),
        overview: episode.overview.length > 0 ? episode.overview : null,
        runtimeMinutes: episode.runtime,
        monitored: input.monitored ?? true,
      })),
    })),
  }
}

export const seriesRouter = {
  add: authedProcedure.input(seriesInputSchema).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* SeriesService
        return yield* svc.add(input)
      }),
    ),
  ),

  addFromTmdb: authedProcedure.input(addFromTmdbSchema).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const metadata = yield* TmdbClient
        const svc = yield* SeriesService
        const details = yield* metadata.getTvSeries(input.tmdbId)
        if (details.tvdbId === null) {
          return yield* new MetadataError({
            provider: "tmdb",
            reason: "not_found",
            message: `TMDB series ${input.tmdbId} does not include a TVDB ID`,
            retryable: false,
          })
        }

        const hydratedSeasons: Array<TmdbTvSeason> = []
        for (const season of details.seasons) {
          if (season.seasonNumber < 0) continue
          hydratedSeasons.push(yield* metadata.getTvSeason(details.id, season.seasonNumber))
        }

        return yield* svc.add(buildMetadataSeriesInput(details, hydratedSeasons, input))
      }),
    ),
  ),

  list: authedProcedure.input(seriesFiltersSchema).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* SeriesService
        return yield* svc.list(input ?? undefined)
      }),
    ),
  ),

  get: authedProcedure.input(z.object({ id: z.number() })).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* SeriesService
        return yield* svc.getById(input.id)
      }),
    ),
  ),

  update: authedProcedure
    .input(z.object({ id: z.number(), data: seriesUpdateSchema }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* SeriesService
          return yield* svc.update(input.id, input.data)
        }),
      ),
    ),

  remove: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* SeriesService
        yield* svc.remove(input.id)
      }),
    ),
  ),

  lookup: authedProcedure.input(z.object({ query: z.string() })).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* SeriesService
        return yield* svc.lookup(input.query)
      }),
    ),
  ),

  toggleSeasonMonitor: authedProcedure
    .input(z.object({ seasonId: z.number(), monitored: z.boolean() }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* SeriesService
          return yield* svc.toggleSeasonMonitor(input.seasonId, input.monitored)
        }),
      ),
    ),

  toggleEpisodeMonitor: authedProcedure
    .input(z.object({ episodeId: z.number(), monitored: z.boolean() }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* SeriesService
          return yield* svc.toggleEpisodeMonitor(input.episodeId, input.monitored)
        }),
      ),
    ),

  calendar: authedProcedure.input(z.object({ start: z.date(), end: z.date() })).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* SeriesService
        return yield* svc.calendar(input)
      }),
    ),
  ),

  // ── Acquisition ──

  searchSeries: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const pipeline = yield* AcquisitionPipeline
        return yield* pipeline.searchAndGrabSeries(input.id)
      }),
    ),
  ),

  searchSeason: authedProcedure.input(z.object({ seasonId: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const pipeline = yield* AcquisitionPipeline
        return yield* pipeline.searchAndGrabSeason(input.seasonId)
      }),
    ),
  ),

  searchEpisode: authedProcedure.input(z.object({ episodeId: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const pipeline = yield* AcquisitionPipeline
        return yield* pipeline.searchAndGrabEpisode(input.episodeId)
      }),
    ),
  ),

  evaluateEpisode: authedProcedure
    .input(z.object({ episodeId: z.number() }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const pipeline = yield* AcquisitionPipeline
          return yield* pipeline.searchAndEvaluateEpisode(input.episodeId)
        }),
      ),
    ),

  grabEpisode: authedProcedure
    .input(
      z.object({
        episodeId: z.number(),
        downloadUrl: z.string(),
        candidateTitle: z.string(),
      }),
    )
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const pipeline = yield* AcquisitionPipeline
          return yield* pipeline.grabEpisode(
            input.episodeId,
            input.downloadUrl,
            input.candidateTitle,
          )
        }),
      ),
    ),
} satisfies TRPCRouterRecord
