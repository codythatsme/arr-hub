import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { BackupService } from "#/effect/services/BackupService"

import { authedProcedure, runEffect } from "../init"

const backupIdSchema = z.object({ id: z.string().min(1) })

export const backupsRouter = {
  list: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const backups = yield* BackupService
        return yield* backups.listDatabaseBackups()
      }),
    ),
  ),

  create: authedProcedure.mutation(() =>
    runEffect(
      Effect.gen(function* () {
        const backups = yield* BackupService
        return yield* backups.createDatabaseBackup()
      }),
    ),
  ),

  restore: authedProcedure.input(backupIdSchema).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const backups = yield* BackupService
        return yield* backups.restoreDatabaseBackup(input.id)
      }),
    ),
  ),
} satisfies TRPCRouterRecord
