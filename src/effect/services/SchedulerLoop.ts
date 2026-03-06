import { desc, eq } from "drizzle-orm"
import { Effect, Schedule } from "effect"

import { schedulerConfig, schedulerJobs } from "#/db/schema"
import type { SchedulerJobPayload, SchedulerJobType } from "#/effect/domain/scheduler"

import { AcquisitionPipeline } from "./AcquisitionPipeline"
import { Db } from "./Db"
import { DownloadMonitor } from "./DownloadMonitor"
import { MovieService } from "./MovieService"
import { SchedulerService } from "./SchedulerService"

// ── Tick: enqueue recurring + claim & dispatch ──

const tick = Effect.gen(function* () {
  const db = yield* Db
  const scheduler = yield* SchedulerService
  const pipeline = yield* AcquisitionPipeline
  const monitor = yield* DownloadMonitor
  const movieService = yield* MovieService

  // 1. Enqueue recurring jobs
  const configs = yield* db.select().from(schedulerConfig)
  const now = Date.now()

  for (const cfg of configs) {
    if (!cfg.enabled || cfg.intervalMinutes <= 0) continue

    // Check last completed job of this type
    const lastRows = yield* db
      .select({ completedAt: schedulerJobs.completedAt })
      .from(schedulerJobs)
      .where(eq(schedulerJobs.jobType, cfg.jobType))
      .orderBy(desc(schedulerJobs.completedAt))
      .limit(1)

    const lastCompleted = lastRows[0]?.completedAt
    const intervalMs = cfg.intervalMinutes * 60_000
    const shouldEnqueue = !lastCompleted || now - lastCompleted.getTime() >= intervalMs

    if (shouldEnqueue) {
      const payload = payloadForType(cfg.jobType)
      if (payload) {
        yield* scheduler.enqueue(payload).pipe(Effect.catchAll(() => Effect.succeed(null)))
      }
    }
  }

  // 2. Claim & execute one job per tick
  const job = yield* scheduler.claimNext()
  if (!job) return

  yield* Effect.gen(function* () {
    const payload = job.payload

    switch (payload._tag) {
      case "rss_sync": {
        const wantedMovies = yield* movieService.list({ status: "wanted", monitored: true })
        for (const movie of wantedMovies) {
          if (movie.qualityProfileId === null) continue
          yield* pipeline
            .searchAndGrab(movie.id)
            .pipe(
              Effect.catchAll((e) =>
                Effect.logWarning(`rss_sync movie ${movie.id} failed: ${e._tag}`),
              ),
            )
        }
        break
      }
      case "search_missing": {
        yield* pipeline.searchAndGrab(payload.movieId)
        break
      }
      case "search_cutoff": {
        // Movies with file but quality below cutoff — handled by searchAndGrab's
        // upgrade path (existing file context gets set from movie columns)
        const availableMovies = yield* movieService.list({ status: "available", monitored: true })
        for (const movie of availableMovies) {
          if (!movie.hasFile || movie.qualityProfileId === null) continue
          yield* pipeline
            .searchAndGrab(movie.id)
            .pipe(
              Effect.catchAll((e) =>
                Effect.logWarning(`search_cutoff movie ${movie.id} failed: ${e._tag}`),
              ),
            )
        }
        break
      }
      case "download_monitor": {
        const completions = yield* monitor.checkCompletions()
        if (completions.length > 0) {
          yield* Effect.log(`download_monitor: ${completions.length} completed`)
        }
        break
      }
    }

    yield* scheduler.complete(job.id)
  }).pipe(
    Effect.catchAll((e) =>
      scheduler
        .fail(job.id, String(e))
        .pipe(
          Effect.catchAll((failErr) =>
            Effect.logError(`scheduler.fail itself errored: ${failErr}`),
          ),
        ),
    ),
  )
})

function payloadForType(jobType: SchedulerJobType): SchedulerJobPayload | null {
  switch (jobType) {
    case "rss_sync":
      return { _tag: "rss_sync" }
    case "download_monitor":
      return { _tag: "download_monitor" }
    case "search_cutoff":
      return { _tag: "search_cutoff" }
    case "search_missing":
      // Manual-only — don't auto-enqueue
      return null
  }
}

// ── Exported loop ──

export const createSchedulerLoop = () =>
  Effect.gen(function* () {
    yield* Effect.log("[scheduler] loop starting")
    yield* tick.pipe(
      Effect.catchAllDefect((d) => Effect.logError(`[scheduler] defect: ${d}`)),
      Effect.repeat(Schedule.spaced("5 seconds")),
    )
  })
