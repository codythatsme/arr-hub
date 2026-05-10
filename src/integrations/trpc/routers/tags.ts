import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { TagService } from "#/effect/services/TagService"

import { authedProcedure, runEffect } from "../init"

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
} satisfies TRPCRouterRecord
