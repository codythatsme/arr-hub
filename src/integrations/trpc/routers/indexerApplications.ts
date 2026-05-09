import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { IndexerApplicationService } from "#/effect/services/IndexerApplicationService"

import { authedProcedure, runEffect } from "../init"

const indexerApplicationSettingsSchema = z.object({
  syncCategories: z.array(z.number().int()).optional(),
  syncLevel: z.enum(["add_only", "full"]).optional(),
  enableRss: z.boolean().optional(),
  enableAutomaticSearch: z.boolean().optional(),
  enableInteractiveSearch: z.boolean().optional(),
  priority: z.number().int().min(1).max(100).optional(),
  minimumSeeders: z.number().int().min(0).optional(),
  seedRatio: z.number().min(0).nullable().optional(),
  seedTimeMinutes: z.number().int().min(0).nullable().optional(),
  seasonPackSeedTimeMinutes: z.number().int().min(0).nullable().optional(),
  rejectBlocklistedTorrentHashesWhileGrabbing: z.boolean().optional(),
})

const indexerApplicationInputSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["radarr", "sonarr"]),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  syncBaseUrl: z.string().url(),
  syncApiKey: z.string().min(1),
  enabled: z.boolean().optional(),
  settings: indexerApplicationSettingsSchema.optional(),
})

const indexerApplicationUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["radarr", "sonarr"]).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  syncBaseUrl: z.string().url().optional(),
  syncApiKey: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  settings: indexerApplicationSettingsSchema.optional(),
})

export const indexerApplicationsRouter = {
  add: authedProcedure.input(indexerApplicationInputSchema).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerApplicationService
        return yield* svc.add(input)
      }),
    ),
  ),

  list: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerApplicationService
        return yield* svc.list()
      }),
    ),
  ),

  get: authedProcedure.input(z.object({ id: z.number().int() })).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerApplicationService
        return yield* svc.getById(input.id)
      }),
    ),
  ),

  update: authedProcedure
    .input(z.object({ id: z.number().int(), data: indexerApplicationUpdateSchema }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* IndexerApplicationService
          return yield* svc.update(input.id, input.data)
        }),
      ),
    ),

  remove: authedProcedure.input(z.object({ id: z.number().int() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerApplicationService
        yield* svc.remove(input.id)
      }),
    ),
  ),

  sync: authedProcedure.input(z.object({ id: z.number().int() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerApplicationService
        return yield* svc.sync(input.id)
      }),
    ),
  ),

  syncEnabled: authedProcedure.mutation(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerApplicationService
        return yield* svc.syncEnabled()
      }),
    ),
  ),
} satisfies TRPCRouterRecord
