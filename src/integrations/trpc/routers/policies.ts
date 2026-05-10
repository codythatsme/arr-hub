import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { delayProfileProtocols, importListTypes } from "#/db/schema"
import { PolicyService } from "#/effect/services/PolicyService"

import { authedProcedure, runEffect } from "../init"

const importListInput = z.object({
  name: z.string(),
  type: z.enum(importListTypes).optional(),
  enabled: z.boolean().optional(),
  enableAuto: z.boolean().optional(),
  qualityProfileId: z.number().nullable().optional(),
  rootFolderPath: z.string().nullable().optional(),
  searchOnAdd: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
})

const releaseProfileTermInput = z.object({
  term: z.string(),
  score: z.number().optional(),
})

const releaseProfileInput = z.object({
  name: z.string(),
  enabled: z.boolean().optional(),
  requiredTerms: z.array(z.string()).optional(),
  ignoredTerms: z.array(z.string()).optional(),
  preferredTerms: z.array(releaseProfileTermInput).optional(),
  indexerIds: z.array(z.number()).optional(),
  tags: z.array(z.string()).optional(),
  excludedTags: z.array(z.string()).optional(),
})

const delayProfileInput = z.object({
  name: z.string(),
  enableUsenet: z.boolean().optional(),
  enableTorrent: z.boolean().optional(),
  preferredProtocol: z.enum(delayProfileProtocols).optional(),
  usenetDelayMinutes: z.number().optional(),
  torrentDelayMinutes: z.number().optional(),
  order: z.number().optional(),
  bypassIfHighestQuality: z.boolean().optional(),
  bypassIfAboveCustomFormatScore: z.boolean().optional(),
  minimumCustomFormatScore: z.number().optional(),
  tags: z.array(z.string()).optional(),
})

export const policiesRouter = {
  listImportLists: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const service = yield* PolicyService
        return yield* service.listImportLists()
      }),
    ),
  ),

  createImportList: authedProcedure.input(importListInput).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const service = yield* PolicyService
        return yield* service.createImportList(input)
      }),
    ),
  ),

  updateImportList: authedProcedure
    .input(z.object({ id: z.number(), data: importListInput }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const service = yield* PolicyService
          return yield* service.updateImportList(input.id, input.data)
        }),
      ),
    ),

  removeImportList: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const service = yield* PolicyService
        yield* service.removeImportList(input.id)
      }),
    ),
  ),

  listReleaseProfiles: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const service = yield* PolicyService
        return yield* service.listReleaseProfiles()
      }),
    ),
  ),

  createReleaseProfile: authedProcedure.input(releaseProfileInput).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const service = yield* PolicyService
        return yield* service.createReleaseProfile(input)
      }),
    ),
  ),

  updateReleaseProfile: authedProcedure
    .input(z.object({ id: z.number(), data: releaseProfileInput }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const service = yield* PolicyService
          return yield* service.updateReleaseProfile(input.id, input.data)
        }),
      ),
    ),

  removeReleaseProfile: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const service = yield* PolicyService
        yield* service.removeReleaseProfile(input.id)
      }),
    ),
  ),

  listDelayProfiles: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const service = yield* PolicyService
        return yield* service.listDelayProfiles()
      }),
    ),
  ),

  createDelayProfile: authedProcedure.input(delayProfileInput).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const service = yield* PolicyService
        return yield* service.createDelayProfile(input)
      }),
    ),
  ),

  updateDelayProfile: authedProcedure
    .input(z.object({ id: z.number(), data: delayProfileInput }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const service = yield* PolicyService
          return yield* service.updateDelayProfile(input.id, input.data)
        }),
      ),
    ),

  removeDelayProfile: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const service = yield* PolicyService
        yield* service.removeDelayProfile(input.id)
      }),
    ),
  ),
} satisfies TRPCRouterRecord
