import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { ImportService } from "#/effect/services/ImportService"

import { publicProcedure, runEffect } from "../init"

const credentialsInput = z.object({
  url: z.string().url(),
  apiKey: z.string().min(1),
})

export const importRouter = {
  testRadarr: publicProcedure.input(credentialsInput).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* ImportService
        return yield* svc.testRadarr(input)
      }),
    ),
  ),

  testSonarr: publicProcedure.input(credentialsInput).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* ImportService
        return yield* svc.testSonarr(input)
      }),
    ),
  ),

  executeRadarr: publicProcedure.input(credentialsInput).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* ImportService
        return yield* svc.importFromRadarr(input)
      }),
    ),
  ),

  executeSonarr: publicProcedure.input(credentialsInput).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* ImportService
        return yield* svc.importFromSonarr(input)
      }),
    ),
  ),
} satisfies TRPCRouterRecord
