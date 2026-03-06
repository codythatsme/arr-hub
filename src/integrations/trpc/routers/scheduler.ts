import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { SchedulerService } from "#/effect/services/SchedulerService"

import { authedProcedure, runEffect } from "../init"

const jobTypeSchema = z.enum(["rss_sync", "search_missing", "search_cutoff", "download_monitor"])

export const schedulerRouter = {
  jobs: authedProcedure
    .input(
      z
        .object({
          status: z.string().optional(),
          jobType: z.string().optional(),
        })
        .nullish(),
    )
    .query(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* SchedulerService
          return yield* svc.listJobs(input ?? undefined)
        }),
      ),
    ),

  status: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* SchedulerService
        return yield* svc.status()
      }),
    ),
  ),

  config: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* SchedulerService
        return yield* svc.getConfig()
      }),
    ),
  ),

  updateConfig: authedProcedure
    .input(
      z.object({
        jobType: jobTypeSchema,
        intervalMinutes: z.number().optional(),
        retryDelaySeconds: z.number().optional(),
        maxRetries: z.number().optional(),
        backoffMultiplier: z.number().optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const svc = yield* SchedulerService
          const { jobType, ...data } = input
          return yield* svc.updateConfig(jobType, data)
        }),
      ),
    ),

  pause: authedProcedure.input(z.object({ jobType: jobTypeSchema })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* SchedulerService
        yield* svc.pause(input.jobType)
      }),
    ),
  ),

  resume: authedProcedure.input(z.object({ jobType: jobTypeSchema })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* SchedulerService
        yield* svc.resume(input.jobType)
      }),
    ),
  ),

  pauseAll: authedProcedure.mutation(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* SchedulerService
        yield* svc.pauseAll()
      }),
    ),
  ),

  resumeAll: authedProcedure.mutation(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* SchedulerService
        yield* svc.resumeAll()
      }),
    ),
  ),

  retryJob: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* SchedulerService
        return yield* svc.retryJob(input.id)
      }),
    ),
  ),
} satisfies TRPCRouterRecord
