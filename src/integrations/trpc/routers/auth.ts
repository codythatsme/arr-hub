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

  changePassword: authedProcedure
    .input(z.object({ currentPassword: z.string(), newPassword: z.string() }))
    .mutation(({ ctx, input }) =>
      runEffect(
        Effect.gen(function* () {
          const auth = yield* AuthService
          yield* auth.changePassword(ctx.userId, input.currentPassword, input.newPassword)
        }),
      ),
    ),

  recoverPassword: publicProcedure
    .input(
      z.object({
        username: z.string().min(1),
        recoveryToken: z.string().min(1),
        newPassword: z.string().min(8),
      }),
    )
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const auth = yield* AuthService
          yield* auth.recoverPassword(input.username, input.recoveryToken, input.newPassword)
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

  listApiKeys: authedProcedure.query(({ ctx }) =>
    runEffect(
      Effect.gen(function* () {
        const auth = yield* AuthService
        return yield* auth.listApiKeys(ctx.userId)
      }),
    ),
  ),
} satisfies TRPCRouterRecord
