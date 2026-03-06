import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { DownloadClientService } from "#/effect/services/DownloadClientService"

import { authedProcedure, runEffect } from "../init"

const downloadClientInputSchema = z.object({
  name: z.string(),
  type: z.string().min(1),
  host: z.string(),
  port: z.number().int().min(1).max(65535),
  username: z.string(),
  password: z.string(),
  useSsl: z.boolean().optional(),
  category: z.string().optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(1).max(100).optional(),
  settings: z.object({ pollIntervalMs: z.number().int().min(1000) }).optional(),
})

const downloadClientUpdateSchema = z.object({
  name: z.string().optional(),
  type: z.string().min(1).optional(),
  host: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  useSsl: z.boolean().optional(),
  category: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(1).max(100).optional(),
  settings: z.object({ pollIntervalMs: z.number().int().min(1000) }).optional(),
})

export const downloadClientsRouter = {
  add: authedProcedure.input(downloadClientInputSchema).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* DownloadClientService
        return yield* svc.add(input)
      }),
    ),
  ),

  list: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* DownloadClientService
        return yield* svc.list()
      }),
    ),
  ),

  get: authedProcedure.input(z.object({ id: z.number() })).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* DownloadClientService
        return yield* svc.getById(input.id)
      }),
    ),
  ),

  update: authedProcedure
    .input(z.object({ id: z.number(), data: downloadClientUpdateSchema }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* DownloadClientService
          return yield* svc.update(input.id, input.data)
        }),
      ),
    ),

  remove: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* DownloadClientService
        yield* svc.remove(input.id)
      }),
    ),
  ),

  test: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* DownloadClientService
        return yield* svc.testConnection(input.id)
      }),
    ),
  ),

  listTypes: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* DownloadClientService
        return svc.listTypes()
      }),
    ),
  ),

  addDownload: authedProcedure
    .input(
      z.object({
        clientId: z.number(),
        url: z.string(),
        options: z
          .object({
            category: z.string().optional(),
            savePath: z.string().optional(),
          })
          .optional(),
      }),
    )
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* DownloadClientService
          return yield* svc.addDownload(input.clientId, input.url, input.options)
        }),
      ),
    ),

  getQueue: authedProcedure
    .input(z.object({ clientId: z.number().optional() }).optional())
    .query(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* DownloadClientService
          return yield* svc.getQueue(input?.clientId)
        }),
      ),
    ),

  removeDownload: authedProcedure
    .input(
      z.object({
        clientId: z.number(),
        externalId: z.string(),
        deleteFiles: z.boolean().default(false),
      }),
    )
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* DownloadClientService
          yield* svc.removeDownload(input.clientId, input.externalId, input.deleteFiles)
        }),
      ),
    ),
} satisfies TRPCRouterRecord
