import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { QueueService } from "#/effect/services/QueueService"

import { authedProcedure, runEffect } from "../init"

const queueStatusSchema = z.enum([
  "all",
  "queued",
  "downloading",
  "importing",
  "completed",
  "failed",
])
const queueMediaTypeSchema = z.enum(["all", "movie", "series", "unlinked"])

export const queueRouter = {
  list: authedProcedure
    .input(
      z
        .object({
          status: queueStatusSchema.optional(),
          clientId: z.number().int().optional(),
          mediaType: queueMediaTypeSchema.optional(),
        })
        .optional(),
    )
    .query(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const queue = yield* QueueService
          return yield* queue.list(input)
        }),
      ),
    ),

  retry: authedProcedure.input(z.object({ id: z.number().int() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const queue = yield* QueueService
        return yield* queue.retry(input.id)
      }),
    ),
  ),

  remove: authedProcedure
    .input(z.object({ id: z.number().int(), deleteFiles: z.boolean().optional() }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const queue = yield* QueueService
          yield* queue.remove(input.id, { deleteFiles: input.deleteFiles })
        }),
      ),
    ),

  blocklist: authedProcedure.input(z.object({ id: z.number().int() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const queue = yield* QueueService
        return yield* queue.blocklist(input.id)
      }),
    ),
  ),
} satisfies TRPCRouterRecord
