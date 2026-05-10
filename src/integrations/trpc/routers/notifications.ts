import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { notificationChannelTypes, notificationEvents } from "#/db/schema"
import { NotificationService } from "#/effect/services/NotificationService"

import { authedProcedure, runEffect } from "../init"

const notificationEventSchema = z.enum(notificationEvents)

const channelInputSchema = z.object({
  name: z.string().min(1),
  type: z.enum(notificationChannelTypes),
  enabled: z.boolean().default(true),
  events: z.array(notificationEventSchema).min(1),
  settings: z
    .object({
      url: z.string().url().optional(),
      headers: z.record(z.string(), z.string()).optional(),
    })
    .default({}),
})

export const notificationsRouter = {
  listChannels: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const service = yield* NotificationService
        return yield* service.listChannels()
      }),
    ),
  ),

  createChannel: authedProcedure.input(channelInputSchema).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const service = yield* NotificationService
        return yield* service.createChannel(input)
      }),
    ),
  ),

  updateChannel: authedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        data: channelInputSchema.partial(),
      }),
    )
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const service = yield* NotificationService
          return yield* service.updateChannel(input.id, input.data)
        }),
      ),
    ),

  deleteChannel: authedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const service = yield* NotificationService
          return yield* service.deleteChannel(input.id)
        }),
      ),
    ),

  listDeliveries: authedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const service = yield* NotificationService
          return yield* service.listDeliveries(input?.limit)
        }),
      ),
    ),

  testChannel: authedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        event: notificationEventSchema.default("server_up"),
      }),
    )
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const service = yield* NotificationService
          return yield* service.testChannel(input.id, input.event)
        }),
      ),
    ),
} satisfies TRPCRouterRecord
