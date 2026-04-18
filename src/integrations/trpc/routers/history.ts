import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

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

  countSince: authedProcedure.input(z.object({ since: z.date() })).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* SessionHistoryService
        return yield* svc.countSince(input.since)
      }),
    ),
  ),
} satisfies TRPCRouterRecord
