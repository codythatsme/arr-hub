import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { IndexerService } from "#/effect/services/IndexerService"

import { authedProcedure, runEffect } from "../init"

const indexerInputSchema = z.object({
  name: z.string(),
  type: z.string().min(1),
  baseUrl: z.string().url(),
  apiKey: z.string(),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(1).max(100).optional(),
  categories: z.array(z.number().int()).optional(),
})

const indexerUpdateSchema = z.object({
  name: z.string().optional(),
  type: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(1).max(100).optional(),
  categories: z.array(z.number().int()).optional(),
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
})

export const indexersRouter = {
  add: authedProcedure.input(indexerInputSchema).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerService
        return yield* svc.add(input)
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
          return yield* svc.update(input.id, input.data)
        }),
      ),
    ),

  remove: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerService
        yield* svc.remove(input.id)
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

  listTypes: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerService
        return svc.listTypes()
      }),
    ),
  ),
} satisfies TRPCRouterRecord
