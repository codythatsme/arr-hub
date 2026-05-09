import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { IndexerService } from "#/effect/services/IndexerService"

import { authedProcedure, runEffect } from "../init"
import { syncEnabledIndexerApplications } from "./indexerApplicationSyncTrigger"

const indexerInputSchema = z.object({
  name: z.string(),
  type: z.string().min(1),
  definitionKey: z.string().nullable().optional(),
  baseUrl: z.string().url(),
  apiKey: z.string(),
  proxyId: z.number().int().nullable().optional(),
  enabled: z.boolean().optional(),
  searchEnabled: z.boolean().optional(),
  rssEnabled: z.boolean().optional(),
  priority: z.number().int().min(1).max(100).optional(),
  minimumSeeders: z.number().int().min(0).nullable().optional(),
  queryCooldownSeconds: z.number().int().min(0).nullable().optional(),
  queryLimitCount: z.number().int().min(0).nullable().optional(),
  queryLimitWindowSeconds: z.number().int().min(0).nullable().optional(),
  categories: z.array(z.number().int()).optional(),
  tags: z.array(z.string()).optional(),
})

const indexerUpdateSchema = z.object({
  name: z.string().optional(),
  type: z.string().min(1).optional(),
  definitionKey: z.string().nullable().optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  proxyId: z.number().int().nullable().optional(),
  enabled: z.boolean().optional(),
  searchEnabled: z.boolean().optional(),
  rssEnabled: z.boolean().optional(),
  priority: z.number().int().min(1).max(100).optional(),
  minimumSeeders: z.number().int().min(0).nullable().optional(),
  queryCooldownSeconds: z.number().int().min(0).nullable().optional(),
  queryLimitCount: z.number().int().min(0).nullable().optional(),
  queryLimitWindowSeconds: z.number().int().min(0).nullable().optional(),
  categories: z.array(z.number().int()).optional(),
  tags: z.array(z.string()).optional(),
})

const searchInputSchema = z.object({
  term: z.string(),
  type: z.enum(["movie", "tv", "general"]),
  categories: z.array(z.number().int()).optional(),
  limit: z.number().int().positive().optional(),
  imdbId: z.string().optional(),
  tmdbId: z.number().int().optional(),
  tvdbId: z.number().int().optional(),
  season: z.number().int().optional(),
  episode: z.number().int().optional(),
  protocol: z.enum(["torrent", "usenet"]).optional(),
})

const indexerProxySettingsSchema = z.object({
  tags: z.array(z.string()).optional(),
  flaresolverrTimeoutMs: z.number().int().positive().optional(),
})

const indexerProxyInputSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["http", "socks4", "socks5", "flaresolverr"]),
  host: z.string().min(1),
  port: z.number().int().positive().nullable().optional(),
  username: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  settings: indexerProxySettingsSchema.optional(),
})

const indexerProxyUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["http", "socks4", "socks5", "flaresolverr"]).optional(),
  host: z.string().min(1).optional(),
  port: z.number().int().positive().nullable().optional(),
  username: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  settings: indexerProxySettingsSchema.optional(),
})

export const indexersRouter = {
  add: authedProcedure.input(indexerInputSchema).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerService
        const indexer = yield* svc.add(input)
        yield* syncEnabledIndexerApplications
        return indexer
      }),
    ),
  ),

  list: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerService
        return yield* svc.list()
      }),
    ),
  ),

  get: authedProcedure.input(z.object({ id: z.number() })).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerService
        return yield* svc.getById(input.id)
      }),
    ),
  ),

  update: authedProcedure
    .input(z.object({ id: z.number(), data: indexerUpdateSchema }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* IndexerService
          const indexer = yield* svc.update(input.id, input.data)
          yield* syncEnabledIndexerApplications
          return indexer
        }),
      ),
    ),

  remove: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerService
        yield* svc.remove(input.id)
        yield* syncEnabledIndexerApplications
      }),
    ),
  ),

  test: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerService
        return yield* svc.testConnection(input.id)
      }),
    ),
  ),

  search: authedProcedure.input(searchInputSchema).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerService
        return yield* svc.search(input)
      }),
    ),
  ),

  listDefinitions: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerService
        return yield* svc.listDefinitions()
      }),
    ),
  ),

  refreshDefinitions: authedProcedure.mutation(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerService
        return yield* svc.refreshDefinitions()
      }),
    ),
  ),

  listStats: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerService
        return yield* svc.listStats()
      }),
    ),
  ),

  listProxies: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerService
        return yield* svc.listProxies()
      }),
    ),
  ),

  addProxy: authedProcedure.input(indexerProxyInputSchema).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerService
        return yield* svc.addProxy(input)
      }),
    ),
  ),

  updateProxy: authedProcedure
    .input(z.object({ id: z.number(), data: indexerProxyUpdateSchema }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* IndexerService
          return yield* svc.updateProxy(input.id, input.data)
        }),
      ),
    ),

  removeProxy: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerService
        yield* svc.removeProxy(input.id)
      }),
    ),
  ),

  listTypes: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerService
        return svc.listTypes()
      }),
    ),
  ),
} satisfies TRPCRouterRecord
