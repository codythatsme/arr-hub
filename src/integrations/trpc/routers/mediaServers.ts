import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { MediaServerService } from "#/effect/services/MediaServerService"

import { authedProcedure, runEffect } from "../init"

const mediaServerInputSchema = z.object({
  name: z.string(),
  type: z.enum(["plex"]),
  host: z.string(),
  port: z.number().int().min(1).max(65535),
  token: z.string(),
  useSsl: z.boolean().optional(),
  enabled: z.boolean().optional(),
  settings: z.object({ syncIntervalMs: z.number().int().min(60000) }).optional(),
})

const mediaServerUpdateSchema = z.object({
  name: z.string().optional(),
  type: z.enum(["plex"]).optional(),
  host: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  token: z.string().optional(),
  useSsl: z.boolean().optional(),
  enabled: z.boolean().optional(),
  settings: z.object({ syncIntervalMs: z.number().int().min(60000) }).optional(),
})

export const mediaServersRouter = {
  add: authedProcedure.input(mediaServerInputSchema).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* MediaServerService
        return yield* svc.add(input)
      }),
    ),
  ),

  list: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* MediaServerService
        return yield* svc.list()
      }),
    ),
  ),

  get: authedProcedure.input(z.object({ id: z.number() })).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* MediaServerService
        return yield* svc.getById(input.id)
      }),
    ),
  ),

  update: authedProcedure
    .input(z.object({ id: z.number(), data: mediaServerUpdateSchema }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* MediaServerService
          return yield* svc.update(input.id, input.data)
        }),
      ),
    ),

  remove: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* MediaServerService
        yield* svc.remove(input.id)
      }),
    ),
  ),

  test: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* MediaServerService
        return yield* svc.testConnection(input.id)
      }),
    ),
  ),

  libraries: authedProcedure.input(z.object({ id: z.number() })).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* MediaServerService
        return yield* svc.getLibraries(input.id)
      }),
    ),
  ),

  sync: authedProcedure
    .input(z.object({ serverId: z.number(), libraryId: z.string() }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* MediaServerService
          return yield* svc.syncLibrary(input.serverId, input.libraryId)
        }),
      ),
    ),

  refresh: authedProcedure
    .input(z.object({ serverId: z.number(), libraryId: z.string(), path: z.string() }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* MediaServerService
          yield* svc.refreshLibrary(input.serverId, input.libraryId, input.path)
        }),
      ),
    ),
} satisfies TRPCRouterRecord
