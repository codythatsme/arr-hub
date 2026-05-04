import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { StatsService } from "#/effect/services/StatsService"

import { authedProcedure, runEffect } from "../init"

const rangeSchema = z.object({ start: z.date(), end: z.date() })

const filtersSchema = z
  .object({
    userId: z.string().optional(),
    mediaType: z.enum(["movie", "episode"]).optional(),
    mediaServerId: z.number().int().optional(),
  })
  .optional()

export const statsRouter = {
  playsByDay: authedProcedure
    .input(z.object({ range: rangeSchema, filters: filtersSchema }))
    .query(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* StatsService
          return yield* svc.getPlaysByDay(input.range, input.filters)
        }),
      ),
    ),

  watchTimeByDay: authedProcedure
    .input(z.object({ range: rangeSchema, filters: filtersSchema }))
    .query(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* StatsService
          return yield* svc.getWatchTimeByDay(input.range, input.filters)
        }),
      ),
    ),

  topMedia: authedProcedure
    .input(
      z.object({
        range: rangeSchema,
        mediaType: z.enum(["movie", "episode"]).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        sort: z.enum(["plays", "duration"]).optional(),
        userId: z.string().optional(),
        mediaServerId: z.number().int().optional(),
      }),
    )
    .query(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* StatsService
          return yield* svc.getTopMedia(input)
        }),
      ),
    ),

  topUsers: authedProcedure
    .input(
      z.object({
        range: rangeSchema,
        limit: z.number().int().min(1).max(100).optional(),
        mediaServerId: z.number().int().optional(),
        mediaType: z.enum(["movie", "episode"]).optional(),
      }),
    )
    .query(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* StatsService
          return yield* svc.getTopUsers(input)
        }),
      ),
    ),

  streamTypes: authedProcedure
    .input(z.object({ range: rangeSchema, filters: filtersSchema }))
    .query(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* StatsService
          return yield* svc.getStreamTypeDistribution(input.range, input.filters)
        }),
      ),
    ),

  playsByHourOfDay: authedProcedure
    .input(z.object({ range: rangeSchema, filters: filtersSchema }))
    .query(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* StatsService
          return yield* svc.getPlaysByHourOfDay(input.range, input.filters)
        }),
      ),
    ),
} satisfies TRPCRouterRecord
