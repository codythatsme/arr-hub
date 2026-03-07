import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { TmdbClient } from "#/effect/services/TmdbClient"

import { authedProcedure, runEffect } from "../init"

export const tmdbRouter = {
  searchMovies: authedProcedure
    .input(z.object({ query: z.string(), page: z.number().int().positive().optional() }))
    .query(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* TmdbClient
          return yield* svc.searchMovies(input.query, input.page)
        }),
      ),
    ),

  getMovie: authedProcedure.input(z.object({ tmdbId: z.number().int() })).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* TmdbClient
        return yield* svc.getMovie(input.tmdbId)
      }),
    ),
  ),

  popular: authedProcedure
    .input(z.object({ page: z.number().int().positive().optional() }))
    .query(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* TmdbClient
          return yield* svc.getPopular(input.page)
        }),
      ),
    ),

  trending: authedProcedure
    .input(z.object({ timeWindow: z.enum(["day", "week"]).optional() }))
    .query(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* TmdbClient
          return yield* svc.getTrending(input.timeWindow)
        }),
      ),
    ),
} satisfies TRPCRouterRecord
