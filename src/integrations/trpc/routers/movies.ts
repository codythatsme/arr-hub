import { z } from 'zod'
import { Effect } from 'effect'
import { authedProcedure, runEffect } from '../init'
import { MovieService } from '#/effect/services/MovieService'
import type { TRPCRouterRecord } from '@trpc/server'

const movieInputSchema = z.object({
  tmdbId: z.number(),
  title: z.string(),
  year: z.number().nullish(),
  overview: z.string().nullish(),
  posterPath: z.string().nullish(),
  status: z.enum(['wanted', 'available', 'missing']).optional(),
  qualityProfileId: z.number().nullish(),
  rootFolderPath: z.string().nullish(),
  monitored: z.boolean().optional(),
})

const movieUpdateSchema = z.object({
  title: z.string().optional(),
  year: z.number().nullish(),
  overview: z.string().nullish(),
  posterPath: z.string().nullish(),
  status: z.enum(['wanted', 'available', 'missing']).optional(),
  qualityProfileId: z.number().nullish(),
  rootFolderPath: z.string().nullish(),
  monitored: z.boolean().optional(),
})

const movieFiltersSchema = z
  .object({
    status: z.enum(['wanted', 'available', 'missing']).optional(),
    monitored: z.boolean().optional(),
  })
  .nullish()

export const moviesRouter = {
  add: authedProcedure
    .input(movieInputSchema)
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* MovieService
          return yield* svc.add(input)
        }),
      ),
    ),

  list: authedProcedure
    .input(movieFiltersSchema)
    .query(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* MovieService
          return yield* svc.list(input ?? undefined)
        }),
      ),
    ),

  get: authedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) =>
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

  remove: authedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* MovieService
          yield* svc.remove(input.id)
        }),
      ),
    ),

  lookup: authedProcedure
    .input(z.object({ query: z.string() }))
    .query(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* MovieService
          return yield* svc.lookup(input.query)
        }),
      ),
    ),
} satisfies TRPCRouterRecord
