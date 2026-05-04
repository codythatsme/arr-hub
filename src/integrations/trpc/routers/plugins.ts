import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { PluginLoader } from "#/effect/services/PluginLoader"

import { authedProcedure, runEffect } from "../init"

export const pluginsRouter = {
  list: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const loader = yield* PluginLoader
        return yield* loader.list()
      }),
    ),
  ),

  scan: authedProcedure
    .input(z.object({ directory: z.string().optional() }).optional())
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const loader = yield* PluginLoader
          return yield* loader.scan(input?.directory)
        }),
      ),
    ),

  enable: authedProcedure.input(z.object({ name: z.string().min(1) })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const loader = yield* PluginLoader
        return yield* loader.enable(input.name)
      }),
    ),
  ),

  disable: authedProcedure.input(z.object({ name: z.string().min(1) })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const loader = yield* PluginLoader
        return yield* loader.disable(input.name)
      }),
    ),
  ),

  remove: authedProcedure.input(z.object({ name: z.string().min(1) })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const loader = yield* PluginLoader
        return yield* loader.remove(input.name)
      }),
    ),
  ),

  health: authedProcedure.input(z.object({ name: z.string().min(1) })).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const loader = yield* PluginLoader
        return yield* loader.health(input.name)
      }),
    ),
  ),
} satisfies TRPCRouterRecord
