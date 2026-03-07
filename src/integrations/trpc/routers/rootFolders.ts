import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { RootFolderService } from "#/effect/services/RootFolderService"

import { authedProcedure, runEffect } from "../init"

export const rootFoldersRouter = {
  add: authedProcedure.input(z.object({ path: z.string() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* RootFolderService
        return yield* svc.add(input)
      }),
    ),
  ),

  list: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* RootFolderService
        return yield* svc.list()
      }),
    ),
  ),

  get: authedProcedure.input(z.object({ id: z.number() })).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* RootFolderService
        return yield* svc.getById(input.id)
      }),
    ),
  ),

  remove: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* RootFolderService
        yield* svc.remove(input.id)
      }),
    ),
  ),

  refreshSpace: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* RootFolderService
        return yield* svc.refreshSpace(input.id)
      }),
    ),
  ),
} satisfies TRPCRouterRecord
