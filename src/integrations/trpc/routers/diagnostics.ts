import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { DiagnosticsService } from "#/effect/services/DiagnosticsService"

import { authedProcedure, runEffect } from "../init"

const logLevelSchema = z.enum(["debug", "info", "warn", "error"])

export const diagnosticsRouter = {
  status: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const diagnostics = yield* DiagnosticsService
        return yield* diagnostics.status()
      }),
    ),
  ),

  health: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const diagnostics = yield* DiagnosticsService
        return yield* diagnostics.health()
      }),
    ),
  ),

  logs: authedProcedure
    .input(
      z
        .object({
          level: logLevelSchema.optional(),
          count: z.number().int().min(1).max(500).optional(),
        })
        .optional(),
    )
    .query(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const diagnostics = yield* DiagnosticsService
          return yield* diagnostics.logs(input)
        }),
      ),
    ),

  tasks: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const diagnostics = yield* DiagnosticsService
        return yield* diagnostics.tasks()
      }),
    ),
  ),
} satisfies TRPCRouterRecord
