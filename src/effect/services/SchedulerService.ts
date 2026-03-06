import { SqlError } from "@effect/sql/SqlError"
import { and, eq, inArray, lte, sql, desc, asc } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { schedulerConfig, schedulerJobs } from "#/db/schema"
import {
  DEFAULT_CONFIGS,
  dedupeKey,
  jobTypeFromPayload,
  type JobTypeSummary,
  type SchedulerJobPayload,
  type SchedulerJobType,
} from "#/effect/domain/scheduler"
import { SchedulerError } from "#/effect/errors"

import { Db } from "./Db"

// ── Types ──

type JobRow = typeof schedulerJobs.$inferSelect
type ConfigRow = typeof schedulerConfig.$inferSelect

// ── Service tag ──

export class SchedulerService extends Context.Tag("@arr-hub/SchedulerService")<
  SchedulerService,
  {
    readonly seedConfig: () => Effect.Effect<void, SqlError>
    readonly enqueue: (
      payload: SchedulerJobPayload,
    ) => Effect.Effect<JobRow | null, SchedulerError | SqlError>
    readonly claimNext: () => Effect.Effect<JobRow | null, SqlError>
    readonly complete: (jobId: number) => Effect.Effect<void, SchedulerError | SqlError>
    readonly fail: (jobId: number, error: string) => Effect.Effect<void, SchedulerError | SqlError>
    readonly pause: (jobType: SchedulerJobType) => Effect.Effect<void, SchedulerError | SqlError>
    readonly resume: (jobType: SchedulerJobType) => Effect.Effect<void, SchedulerError | SqlError>
    readonly status: () => Effect.Effect<ReadonlyArray<JobTypeSummary>, SqlError>
    readonly getConfig: () => Effect.Effect<ReadonlyArray<ConfigRow>, SqlError>
    readonly updateConfig: (
      jobType: SchedulerJobType,
      data: {
        intervalMinutes?: number
        retryDelaySeconds?: number
        maxRetries?: number
        backoffMultiplier?: number
        enabled?: boolean
      },
    ) => Effect.Effect<ConfigRow, SchedulerError | SqlError>
    readonly listJobs: (filters?: {
      status?: string
      jobType?: string
    }) => Effect.Effect<ReadonlyArray<JobRow>, SqlError>
  }
>() {}

// ── Live implementation ──

export const SchedulerServiceLive = Layer.effect(
  SchedulerService,
  Effect.gen(function* () {
    const db = yield* Db

    return {
      seedConfig: () =>
        Effect.gen(function* () {
          for (const cfg of DEFAULT_CONFIGS) {
            yield* db
              .insert(schedulerConfig)
              .values({
                jobType: cfg.jobType,
                intervalMinutes: cfg.intervalMinutes,
                retryDelaySeconds: cfg.retryDelaySeconds,
                maxRetries: cfg.maxRetries,
                backoffMultiplier: cfg.backoffMultiplier,
                enabled: cfg.enabled,
              })
              .onConflictDoNothing()
          }
        }),

      enqueue: (payload) =>
        Effect.gen(function* () {
          const key = dedupeKey(payload)
          const jobType = jobTypeFromPayload(payload)

          // Check config enabled
          const cfgRows = yield* db
            .select()
            .from(schedulerConfig)
            .where(eq(schedulerConfig.jobType, jobType))
          const cfg = cfgRows[0]
          if (cfg && !cfg.enabled) {
            return yield* new SchedulerError({
              reason: "paused",
              message: `job type ${jobType} is paused`,
            })
          }

          // Dedupe: check for active job with same key
          const active = yield* db
            .select({ id: schedulerJobs.id })
            .from(schedulerJobs)
            .where(
              and(
                eq(schedulerJobs.dedupeKey, key),
                inArray(schedulerJobs.status, ["pending", "running"]),
              ),
            )
            .limit(1)

          if (active.length > 0) return null

          const maxAttempts = cfg?.maxRetries ? cfg.maxRetries + 1 : 4

          const rows = yield* db
            .insert(schedulerJobs)
            .values({
              jobType,
              status: "pending",
              dedupeKey: key,
              payload,
              attempts: 0,
              maxAttempts,
            })
            .returning()

          return rows[0]
        }),

      claimNext: () =>
        Effect.gen(function* () {
          const now = new Date()

          // Select oldest pending job where nextRunAt <= now
          const candidates = yield* db
            .select()
            .from(schedulerJobs)
            .where(and(eq(schedulerJobs.status, "pending"), lte(schedulerJobs.nextRunAt, now)))
            .orderBy(asc(schedulerJobs.nextRunAt))
            .limit(1)

          const job = candidates[0]
          if (!job) return null

          // Atomically update to running + increment attempts
          const updated = yield* db
            .update(schedulerJobs)
            .set({
              status: "running",
              attempts: job.attempts + 1,
              startedAt: now,
            })
            .where(and(eq(schedulerJobs.id, job.id), eq(schedulerJobs.status, "pending")))
            .returning()

          return updated[0] ?? null
        }),

      complete: (jobId) =>
        Effect.gen(function* () {
          const rows = yield* db
            .update(schedulerJobs)
            .set({
              status: "completed",
              completedAt: new Date(),
            })
            .where(and(eq(schedulerJobs.id, jobId), eq(schedulerJobs.status, "running")))
            .returning({ id: schedulerJobs.id })

          if (rows.length === 0) {
            return yield* new SchedulerError({
              reason: "invalid_transition",
              message: `job ${jobId} not in running state`,
            })
          }
        }),

      fail: (jobId, error) =>
        Effect.gen(function* () {
          const rows = yield* db.select().from(schedulerJobs).where(eq(schedulerJobs.id, jobId))
          const job = rows[0]
          if (!job) {
            return yield* new SchedulerError({
              reason: "invalid_transition",
              message: `job ${jobId} not found`,
            })
          }

          // Load config for backoff params
          const cfgRows = yield* db
            .select()
            .from(schedulerConfig)
            .where(eq(schedulerConfig.jobType, job.jobType))
          const cfg = cfgRows[0]

          const retryDelay = cfg?.retryDelaySeconds ?? 60
          const backoff = cfg?.backoffMultiplier ?? 2

          if (job.attempts >= job.maxAttempts) {
            // Dead-letter
            yield* db
              .update(schedulerJobs)
              .set({
                status: "dead",
                errorMessage: error,
                completedAt: new Date(),
              })
              .where(eq(schedulerJobs.id, jobId))
          } else {
            // Retry with exponential backoff
            const delayMs = retryDelay * Math.pow(backoff, job.attempts) * 1000
            const nextRun = new Date(Date.now() + delayMs)

            yield* db
              .update(schedulerJobs)
              .set({
                status: "pending",
                errorMessage: error,
                nextRunAt: nextRun,
              })
              .where(eq(schedulerJobs.id, jobId))
          }
        }),

      pause: (jobType) =>
        Effect.gen(function* () {
          const rows = yield* db
            .update(schedulerConfig)
            .set({ enabled: false })
            .where(eq(schedulerConfig.jobType, jobType))
            .returning({ id: schedulerConfig.id })

          if (rows.length === 0) {
            return yield* new SchedulerError({
              reason: "invalid_transition",
              message: `config for ${jobType} not found`,
            })
          }
        }),

      resume: (jobType) =>
        Effect.gen(function* () {
          const rows = yield* db
            .update(schedulerConfig)
            .set({ enabled: true })
            .where(eq(schedulerConfig.jobType, jobType))
            .returning({ id: schedulerConfig.id })

          if (rows.length === 0) {
            return yield* new SchedulerError({
              reason: "invalid_transition",
              message: `config for ${jobType} not found`,
            })
          }
        }),

      status: () =>
        Effect.gen(function* () {
          const configs = yield* db.select().from(schedulerConfig)

          const summaries: Array<JobTypeSummary> = []
          for (const cfg of configs) {
            // Active count
            const activeRows = yield* db
              .select({ count: sql<number>`count(*)` })
              .from(schedulerJobs)
              .where(
                and(
                  eq(schedulerJobs.jobType, cfg.jobType),
                  inArray(schedulerJobs.status, ["pending", "running"]),
                ),
              )
            const activeCount = activeRows[0]?.count ?? 0

            // Last completed
            const lastRows = yield* db
              .select({ completedAt: schedulerJobs.completedAt })
              .from(schedulerJobs)
              .where(
                and(eq(schedulerJobs.jobType, cfg.jobType), eq(schedulerJobs.status, "completed")),
              )
              .orderBy(desc(schedulerJobs.completedAt))
              .limit(1)

            // Next pending
            const nextRows = yield* db
              .select({ nextRunAt: schedulerJobs.nextRunAt })
              .from(schedulerJobs)
              .where(
                and(eq(schedulerJobs.jobType, cfg.jobType), eq(schedulerJobs.status, "pending")),
              )
              .orderBy(asc(schedulerJobs.nextRunAt))
              .limit(1)

            summaries.push({
              jobType: cfg.jobType,
              enabled: cfg.enabled,
              intervalMinutes: cfg.intervalMinutes,
              activeCount,
              lastCompletedAt: lastRows[0]?.completedAt ?? null,
              nextRunAt: nextRows[0]?.nextRunAt ?? null,
            })
          }

          return summaries
        }),

      getConfig: () =>
        Effect.gen(function* () {
          return yield* db.select().from(schedulerConfig)
        }),

      updateConfig: (jobType, data) =>
        Effect.gen(function* () {
          const updateData: Record<string, unknown> = {}
          if (data.intervalMinutes !== undefined) updateData.intervalMinutes = data.intervalMinutes
          if (data.retryDelaySeconds !== undefined)
            updateData.retryDelaySeconds = data.retryDelaySeconds
          if (data.maxRetries !== undefined) updateData.maxRetries = data.maxRetries
          if (data.backoffMultiplier !== undefined)
            updateData.backoffMultiplier = data.backoffMultiplier
          if (data.enabled !== undefined) updateData.enabled = data.enabled

          const rows = yield* db
            .update(schedulerConfig)
            .set(updateData)
            .where(eq(schedulerConfig.jobType, jobType))
            .returning()

          if (rows.length === 0) {
            return yield* new SchedulerError({
              reason: "invalid_transition",
              message: `config for ${jobType} not found`,
            })
          }

          return rows[0]
        }),

      listJobs: (filters) =>
        Effect.gen(function* () {
          const conditions: Array<ReturnType<typeof eq>> = []
          if (filters?.status) {
            conditions.push(
              eq(schedulerJobs.status, filters.status as typeof schedulerJobs.status._.data),
            )
          }
          if (filters?.jobType) {
            conditions.push(
              eq(schedulerJobs.jobType, filters.jobType as typeof schedulerJobs.jobType._.data),
            )
          }

          const where = conditions.length > 0 ? and(...conditions) : undefined

          return yield* db
            .select()
            .from(schedulerJobs)
            .where(where)
            .orderBy(desc(schedulerJobs.createdAt))
        }),
    }
  }),
)
