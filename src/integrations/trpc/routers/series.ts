import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { SeriesService } from "#/effect/services/SeriesService"

import { authedProcedure, runEffect } from "../init"

const episodeInputSchema = z.object({
  tvdbId: z.number(),
  title: z.string(),
  episodeNumber: z.number(),
  airDate: z.date().nullish(),
  overview: z.string().nullish(),
  hasFile: z.boolean().optional(),
  filePath: z.string().nullish(),
  monitored: z.boolean().optional(),
})

const seasonInputSchema = z.object({
  seasonNumber: z.number(),
  monitored: z.boolean().optional(),
  episodes: z.array(episodeInputSchema).optional(),
})

const seriesInputSchema = z.object({
  tvdbId: z.number(),
  title: z.string(),
  year: z.number().nullish(),
  overview: z.string().nullish(),
  posterPath: z.string().nullish(),
  status: z.enum(["continuing", "ended", "wanted", "available"]).optional(),
  network: z.string().nullish(),
  rootFolderPath: z.string().nullish(),
  monitored: z.boolean().optional(),
  qualityProfileId: z.number().nullish(),
  seasonFolder: z.boolean().optional(),
  seasons: z.array(seasonInputSchema).optional(),
})

const seriesUpdateSchema = z.object({
  title: z.string().optional(),
  year: z.number().nullish(),
  overview: z.string().nullish(),
  posterPath: z.string().nullish(),
  status: z.enum(["continuing", "ended", "wanted", "available"]).optional(),
  network: z.string().nullish(),
  rootFolderPath: z.string().nullish(),
  monitored: z.boolean().optional(),
  qualityProfileId: z.number().nullish(),
  seasonFolder: z.boolean().optional(),
})

const seriesFiltersSchema = z
  .object({
    status: z.enum(["continuing", "ended", "wanted", "available"]).optional(),
    monitored: z.boolean().optional(),
  })
  .nullish()

export const seriesRouter = {
  add: authedProcedure.input(seriesInputSchema).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* SeriesService
        return yield* svc.add(input)
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

  calendar: authedProcedure
    .input(z.object({ start: z.date(), end: z.date() }))
    .query(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* SeriesService
          return yield* svc.calendar(input)
        }),
      ),
    ),
} satisfies TRPCRouterRecord
