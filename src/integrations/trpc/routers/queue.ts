import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { downloadHistoryMediaKinds, downloadHistoryStatuses } from "#/db/schema"
import { DownloadHistoryService } from "#/effect/services/DownloadHistoryService"
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
const downloadHistoryStatusSchema = z.enum(["all", ...downloadHistoryStatuses])
const downloadHistoryMediaKindSchema = z.enum(["all", ...downloadHistoryMediaKinds])

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

  history: authedProcedure
    .input(
      z
        .object({
          cursor: z.number().int().nullish(),
          limit: z.number().int().min(1).max(200).optional(),
          status: downloadHistoryStatusSchema.optional(),
          mediaKind: downloadHistoryMediaKindSchema.optional(),
          clientId: z.number().int().optional(),
        })
        .optional(),
    )
    .query(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const history = yield* DownloadHistoryService
          return yield* history.list({
            cursor: input?.cursor,
            limit: input?.limit,
            filters: {
              ...(input?.status && input.status !== "all" ? { status: input.status } : {}),
              ...(input?.mediaKind && input.mediaKind !== "all"
                ? { mediaKind: input.mediaKind }
                : {}),
              ...(input?.clientId !== undefined ? { downloadClientId: input.clientId } : {}),
            },
          })
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

  clearError: authedProcedure.input(z.object({ id: z.number().int() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const queue = yield* QueueService
        return yield* queue.clearError(input.id)
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
