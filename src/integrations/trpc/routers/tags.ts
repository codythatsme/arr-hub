import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import {
  autoTaggingMediaTypes,
  autoTaggingSpecificationTypes,
  customFilterTypes,
} from "#/db/schema"
import { AutoTaggingService } from "#/effect/services/AutoTaggingService"
import { TagService } from "#/effect/services/TagService"

import { authedProcedure, runEffect } from "../init"

const autoTaggingSpecificationSchema = z.object({
  type: z.enum(autoTaggingSpecificationTypes),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.array(z.number())]),
  negate: z.boolean().optional(),
})

const autoTaggingRuleInput = z.object({
  name: z.string(),
  mediaType: z.enum(autoTaggingMediaTypes).optional(),
  tags: z.array(z.string()),
  specifications: z.array(autoTaggingSpecificationSchema),
  removeTagsAutomatically: z.boolean().optional(),
})

const customFilterInput = z.object({
  type: z.enum(customFilterTypes),
  label: z.string(),
  filters: z.object({
    status: z.string().nullish(),
    monitored: z.boolean().nullish(),
    tags: z.array(z.string()).optional(),
    genres: z.array(z.string()).optional(),
    qualityProfileId: z.number().nullish(),
    rootFolderPath: z.string().nullish(),
  }),
})

export const tagsRouter = {
  list: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const service = yield* TagService
        return yield* service.list()
      }),
    ),
  ),

  create: authedProcedure.input(z.object({ label: z.string() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const service = yield* TagService
        return yield* service.create(input.label)
      }),
    ),
  ),

  remove: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const service = yield* TagService
        yield* service.remove(input.id)
      }),
    ),
  ),

  listAutoTaggingRules: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const service = yield* AutoTaggingService
        return yield* service.listRules()
      }),
    ),
  ),

  createAutoTaggingRule: authedProcedure.input(autoTaggingRuleInput).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const service = yield* AutoTaggingService
        return yield* service.createRule(input)
      }),
    ),
  ),

  updateAutoTaggingRule: authedProcedure
    .input(z.object({ id: z.number(), data: autoTaggingRuleInput }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const service = yield* AutoTaggingService
          return yield* service.updateRule(input.id, input.data)
        }),
      ),
    ),

  removeAutoTaggingRule: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const service = yield* AutoTaggingService
        yield* service.removeRule(input.id)
      }),
    ),
  ),

  applyAutoTaggingRules: authedProcedure.mutation(() =>
    runEffect(
      Effect.gen(function* () {
        const service = yield* AutoTaggingService
        return yield* service.applyRules()
      }),
    ),
  ),

  listCustomFilters: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const service = yield* AutoTaggingService
        return yield* service.listCustomFilters()
      }),
    ),
  ),

  createCustomFilter: authedProcedure.input(customFilterInput).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const service = yield* AutoTaggingService
        return yield* service.createCustomFilter(input)
      }),
    ),
  ),

  updateCustomFilter: authedProcedure
    .input(z.object({ id: z.number(), data: customFilterInput }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const service = yield* AutoTaggingService
          return yield* service.updateCustomFilter(input.id, input.data)
        }),
      ),
    ),

  removeCustomFilter: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const service = yield* AutoTaggingService
        yield* service.removeCustomFilter(input.id)
      }),
    ),
  ),
} satisfies TRPCRouterRecord
