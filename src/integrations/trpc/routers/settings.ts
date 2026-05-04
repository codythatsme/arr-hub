import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { SettingsService } from "#/effect/services/SettingsService"

import { authedProcedure, runEffect } from "../init"

export const settingsRouter = {
  list: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const settings = yield* SettingsService
        return yield* settings.list()
      }),
    ),
  ),

  get: authedProcedure.input(z.object({ key: z.string() })).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const settings = yield* SettingsService
        return yield* settings.get(input.key)
      }),
    ),
  ),

  set: authedProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const settings = yield* SettingsService
          return yield* settings.set(input.key, input.value)
        }),
      ),
    ),
} satisfies TRPCRouterRecord
