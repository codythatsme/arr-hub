import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { AcquisitionPipeline } from "#/effect/services/AcquisitionPipeline"
import { MovieService } from "#/effect/services/MovieService"

import { authedProcedure, runEffect } from "../init"

const movieInputSchema = z.object({
  tmdbId: z.number(),
  imdbId: z.string().nullish(),
  title: z.string(),
  originalTitle: z.string().nullish(),
  year: z.number().nullish(),
  releaseDate: z.date().nullish(),
  overview: z.string().nullish(),
  posterPath: z.string().nullish(),
  genres: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  runtimeMinutes: z.number().nullish(),
  status: z.enum(["wanted", "available", "missing"]).optional(),
  qualityProfileId: z.number().nullish(),
  rootFolderPath: z.string().nullish(),
  monitored: z.boolean().optional(),
  metadataRefreshedAt: z.date().nullish(),
})

const movieUpdateSchema = z.object({
  imdbId: z.string().nullish(),
  title: z.string().optional(),
  originalTitle: z.string().nullish(),
  year: z.number().nullish(),
  releaseDate: z.date().nullish(),
  overview: z.string().nullish(),
  posterPath: z.string().nullish(),
  genres: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  runtimeMinutes: z.number().nullish(),
  status: z.enum(["wanted", "available", "missing"]).optional(),
  qualityProfileId: z.number().nullish(),
  rootFolderPath: z.string().nullish(),
  monitored: z.boolean().optional(),
  metadataRefreshedAt: z.date().nullish(),
})

const movieFiltersSchema = z
  .object({
    status: z.enum(["wanted", "available", "missing"]).optional(),
    monitored: z.boolean().optional(),
  })
  .nullish()

export const moviesRouter = {
  add: authedProcedure.input(movieInputSchema).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* MovieService
        return yield* svc.add(input)
      }),
    ),
  ),

  list: authedProcedure.input(movieFiltersSchema).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* MovieService
        return yield* svc.list(input ?? undefined)
      }),
    ),
  ),

  get: authedProcedure.input(z.object({ id: z.number() })).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* MovieService
        return yield* svc.getById(input.id)
      }),
    ),
  ),

  update: authedProcedure
    .input(z.object({ id: z.number(), data: movieUpdateSchema }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* MovieService
          return yield* svc.update(input.id, input.data)
        }),
      ),
    ),

  remove: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* MovieService
        yield* svc.remove(input.id)
      }),
    ),
  ),

  lookup: authedProcedure.input(z.object({ query: z.string() })).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* MovieService
        return yield* svc.lookup(input.query)
      }),
    ),
  ),

  search: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const pipeline = yield* AcquisitionPipeline
        return yield* pipeline.searchAndEvaluate(input.id)
      }),
    ),
  ),

  grab: authedProcedure
    .input(
      z.object({
        id: z.number(),
        downloadUrl: z.string(),
        candidateTitle: z.string(),
      }),
    )
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const pipeline = yield* AcquisitionPipeline
          return yield* pipeline.grab(input.id, input.downloadUrl, input.candidateTitle)
        }),
      ),
    ),

  searchAndGrab: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const pipeline = yield* AcquisitionPipeline
        return yield* pipeline.searchAndGrab(input.id)
      }),
    ),
  ),
} satisfies TRPCRouterRecord
