import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { domainHistoryEventTypes, domainHistoryMediaKinds } from "#/db/schema"
import { OperationalHistoryService } from "#/effect/services/OperationalHistoryService"
import { SessionHistoryService } from "#/effect/services/SessionHistoryService"

import { authedProcedure, runEffect } from "../init"

const listInputSchema = z
  .object({
    cursor: z.number().int().nullish(),
    limit: z.number().int().min(1).max(200).optional(),
    filters: z
      .object({
        userId: z.string().optional(),
        mediaType: z.enum(["movie", "episode"]).optional(),
        mediaServerId: z.number().int().optional(),
        start: z.date().optional(),
        end: z.date().optional(),
      })
      .optional(),
  })
  .optional()

const forMediaInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("movie"), movieId: z.number().int() }),
  z.object({ kind: z.literal("episode"), episodeId: z.number().int() }),
])

const operationalListInputSchema = z
  .object({
    cursor: z.number().int().nullish(),
    limit: z.number().int().min(1).max(200).optional(),
    filters: z
      .object({
        eventType: z.enum(domainHistoryEventTypes).optional(),
        mediaKind: z.enum(domainHistoryMediaKinds).optional(),
        movieId: z.number().int().optional(),
        seriesId: z.number().int().optional(),
        seasonId: z.number().int().optional(),
        episodeId: z.number().int().optional(),
        indexerId: z.number().int().optional(),
        downloadClientId: z.number().int().optional(),
        start: z.date().optional(),
        end: z.date().optional(),
      })
      .optional(),
  })
  .optional()

export const historyRouter = {
  list: authedProcedure.input(listInputSchema).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* SessionHistoryService
        return yield* svc.listHistory(input ?? undefined)
      }),
    ),
  ),

  getForMedia: authedProcedure.input(forMediaInputSchema).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* SessionHistoryService
        return yield* svc.getHistoryForMedia(input)
      }),
    ),
  ),

  getForSeries: authedProcedure.input(z.object({ seriesId: z.number().int() })).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* SessionHistoryService
        return yield* svc.getHistoryForSeries(input.seriesId)
      }),
    ),
  ),

  countSince: authedProcedure.input(z.object({ since: z.date() })).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* SessionHistoryService
        return yield* svc.countSince(input.since)
      }),
    ),
  ),

  listOperational: authedProcedure.input(operationalListInputSchema).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* OperationalHistoryService
        return yield* svc.list(input ?? undefined)
      }),
    ),
  ),
} satisfies TRPCRouterRecord
