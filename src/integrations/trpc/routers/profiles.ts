import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { ProfileDefaultsEngine } from "#/effect/services/ProfileDefaultsEngine"
import { ProfileService } from "#/effect/services/ProfileService"

import { authedProcedure, runEffect } from "../init"

const qualityItemSchema = z.object({
  qualityName: z.string().nullable(),
  groupName: z.string().nullable(),
  weight: z.number(),
  allowed: z.boolean(),
})

const formatScoreSchema = z.object({
  customFormatId: z.number(),
  score: z.number(),
})

const profileInputSchema = z.object({
  name: z.string(),
  upgradeAllowed: z.boolean().optional(),
  minFormatScore: z.number().optional(),
  cutoffFormatScore: z.number().optional(),
  minUpgradeFormatScore: z.number().optional(),
  isDefault: z.boolean().optional(),
  qualityItems: z.array(qualityItemSchema).optional(),
  formatScores: z.array(formatScoreSchema).optional(),
})

const profileUpdateSchema = z.object({
  name: z.string().optional(),
  upgradeAllowed: z.boolean().optional(),
  minFormatScore: z.number().optional(),
  cutoffFormatScore: z.number().optional(),
  minUpgradeFormatScore: z.number().optional(),
  isDefault: z.boolean().optional(),
  qualityItems: z.array(qualityItemSchema).optional(),
  formatScores: z.array(formatScoreSchema).optional(),
})

export const profilesRouter = {
  list: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* ProfileService
        return yield* svc.list()
      }),
    ),
  ),

  create: authedProcedure.input(profileInputSchema).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* ProfileService
        return yield* svc.create(input)
      }),
    ),
  ),

  update: authedProcedure
    .input(z.object({ id: z.number(), data: profileUpdateSchema }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* ProfileService
          return yield* svc.update(input.id, input.data)
        }),
      ),
    ),

  delete: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* ProfileService
        yield* svc.remove(input.id)
      }),
    ),
  ),

  preview: authedProcedure
    .input(
      z.object({
        bundleId: z.string(),
        overrides: z.object({ qualityItems: z.array(qualityItemSchema) }).optional(),
      }),
    )
    .query(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const engine = yield* ProfileDefaultsEngine
          return yield* engine.previewEffective(input.bundleId, input.overrides)
        }),
      ),
    ),

  previewReapply: authedProcedure
    .input(z.object({ profileId: z.number(), bundleId: z.string() }))
    .query(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const engine = yield* ProfileDefaultsEngine
          return yield* engine.previewReapply(input.profileId, input.bundleId)
        }),
      ),
    ),

  bundles: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const engine = yield* ProfileDefaultsEngine
        return yield* engine.listBundles()
      }),
    ),
  ),

  applyBundle: authedProcedure
    .input(
      z.object({
        profileId: z.number(),
        bundleId: z.string(),
        force: z.boolean().optional(),
      }),
    )
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const engine = yield* ProfileDefaultsEngine
          return yield* engine.applyBundle(input.bundleId, input.profileId, {
            force: input.force,
          })
        }),
      ),
    ),
} satisfies TRPCRouterRecord
