import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { PlexUserService } from "#/effect/services/PlexUserService"

import { authedProcedure, runEffect } from "../init"

export const plexUsersRouter = {
  list: authedProcedure.input(z.object({ serverId: z.number().int() })).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* PlexUserService
        return yield* svc.listUsers(input.serverId)
      }),
    ),
  ),

  sync: authedProcedure.input(z.object({ serverId: z.number().int() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* PlexUserService
        return yield* svc.syncUsers(input.serverId)
      }),
    ),
  ),

  getStats: authedProcedure
    .input(z.object({ serverId: z.number().int(), plexUserId: z.string() }))
    .query(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* PlexUserService
          return yield* svc.getUserStats(input)
        }),
      ),
    ),
} satisfies TRPCRouterRecord
