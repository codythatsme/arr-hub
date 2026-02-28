import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { AuthService } from "#/effect/services/AuthService"

import { authedProcedure, publicProcedure, runEffect } from "../init"

export const authRouter = {
  login: publicProcedure
    .input(z.object({ username: z.string(), password: z.string() }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const auth = yield* AuthService
          return yield* auth.login(input.username, input.password)
        }),
      ),
    ),

  createApiKey: authedProcedure.input(z.object({ name: z.string() })).mutation(({ ctx, input }) =>
    runEffect(
      Effect.gen(function* () {
        const auth = yield* AuthService
        return yield* auth.createApiKey(ctx.userId, input.name)
      }),
    ),
  ),

  revokeApiKey: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const auth = yield* AuthService
        yield* auth.revokeApiKey(input.id)
      }),
    ),
  ),
} satisfies TRPCRouterRecord
