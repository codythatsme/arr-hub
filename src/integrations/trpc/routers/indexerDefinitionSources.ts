import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { IndexerDefinitionSourceService } from "#/effect/services/IndexerDefinitionSourceService"

import { authedProcedure, runEffect } from "../init"

const sourceInputSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  enabled: z.boolean().optional(),
  pinnedSha256: z
    .string()
    .regex(/^[\da-f]{64}$/i)
    .nullable()
    .optional(),
})

const sourceUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().url().optional(),
  enabled: z.boolean().optional(),
  pinnedSha256: z
    .string()
    .regex(/^[\da-f]{64}$/i)
    .nullable()
    .optional(),
})

const catalogImportSchema = z.object({
  url: z.string().url(),
  pinnedSha256: z.string().regex(/^[\da-f]{64}$/i),
})

export const indexerDefinitionSourcesRouter = {
  add: authedProcedure.input(sourceInputSchema).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerDefinitionSourceService
        return yield* svc.add(input)
      }),
    ),
  ),

  list: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerDefinitionSourceService
        return yield* svc.list()
      }),
    ),
  ),

  get: authedProcedure.input(z.object({ id: z.number().int() })).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerDefinitionSourceService
        return yield* svc.getById(input.id)
      }),
    ),
  ),

  update: authedProcedure
    .input(z.object({ id: z.number().int(), data: sourceUpdateSchema }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* IndexerDefinitionSourceService
          return yield* svc.update(input.id, input.data)
        }),
      ),
    ),

  remove: authedProcedure.input(z.object({ id: z.number().int() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerDefinitionSourceService
        yield* svc.remove(input.id)
      }),
    ),
  ),

  refresh: authedProcedure.input(z.object({ id: z.number().int() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerDefinitionSourceService
        return yield* svc.refresh(input.id)
      }),
    ),
  ),

  refreshEnabled: authedProcedure.mutation(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerDefinitionSourceService
        return yield* svc.refreshEnabled()
      }),
    ),
  ),

  importCatalog: authedProcedure.input(catalogImportSchema).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* IndexerDefinitionSourceService
        return yield* svc.importCatalog(input)
      }),
    ),
  ),
} satisfies TRPCRouterRecord
