import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { Quality, type QualityName } from "#/effect/domain/quality"
import { ReleasePolicyEngine } from "#/effect/services/ReleasePolicyEngine"

import { authedProcedure, runEffect } from "../init"

const releaseCandidateSchema = z.object({
  title: z.string(),
  indexerId: z.number().int(),
  indexerName: z.string(),
  indexerPriority: z.number().int(),
  size: z.number(),
  seeders: z.number().int().nullable(),
  leechers: z.number().int().nullable(),
  age: z.number(),
  downloadUrl: z.string(),
  infoUrl: z.string().nullable(),
  category: z.string(),
  protocol: z.enum(["torrent", "usenet"]),
  publishedAt: z.date(),
  infohash: z.string().nullable(),
  downloadFactor: z.number(),
  uploadFactor: z.number(),
})

const evaluateInputSchema = z.object({
  candidates: z.array(releaseCandidateSchema),
  profileId: z.number().int(),
  context: z.object({
    mediaId: z.number().int(),
    mediaType: z.enum(["movie", "episode"]),
    existingFile: z
      .object({
        qualityName: z.enum(Object.keys(Quality) as [QualityName, ...ReadonlyArray<QualityName>]),
        qualityRank: z.number().int(),
        formatScore: z.number().int(),
      })
      .optional(),
  }),
})

const historyInputSchema = z.object({
  mediaId: z.number().int(),
  mediaType: z.enum(["movie", "episode"]),
})

export const releasesRouter = {
  evaluate: authedProcedure.input(evaluateInputSchema).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const engine = yield* ReleasePolicyEngine
        return yield* engine.evaluate(input.candidates, input.profileId, input.context)
      }),
    ),
  ),

  history: authedProcedure.input(historyInputSchema).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const engine = yield* ReleasePolicyEngine
        return yield* engine.history(input.mediaId, input.mediaType)
      }),
    ),
  ),
} satisfies TRPCRouterRecord
