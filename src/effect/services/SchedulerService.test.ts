import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import { TestDbLive } from "#/effect/test/TestDb"

import { SchedulerService, SchedulerServiceLive } from "./SchedulerService"

const TestLayer = SchedulerServiceLive.pipe(Layer.provideMerge(TestDbLive))

/** Seed config before each test that needs it. */
function withSeed<A, E>(effect: Effect.Effect<A, E, SchedulerService>) {
  return Effect.gen(function* () {
    const svc = yield* SchedulerService
    yield* svc.seedConfig()
    return yield* effect
  })
}

describe("SchedulerService", () => {
  it.effect("seedConfig upserts default configs", () =>
    withSeed(
      Effect.gen(function* () {
        const svc = yield* SchedulerService
        const configs = yield* svc.getConfig()
        expect(configs).toHaveLength(4)
        const types = configs.map((c) => c.jobType).toSorted()
        expect(types).toEqual(["download_monitor", "rss_sync", "search_cutoff", "search_missing"])
      }),
    ).pipe(Effect.provide(TestLayer)),
  )

  it.effect("seedConfig is idempotent", () =>
    Effect.gen(function* () {
      const svc = yield* SchedulerService
      yield* svc.seedConfig()
      yield* svc.seedConfig()
      const configs = yield* svc.getConfig()
      expect(configs).toHaveLength(4)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("enqueue creates a pending job", () =>
    withSeed(
      Effect.gen(function* () {
        const svc = yield* SchedulerService
        const job = yield* svc.enqueue({ _tag: "rss_sync" })
        expect(job).not.toBeNull()
        expect(job?.status).toBe("pending")
        expect(job?.jobType).toBe("rss_sync")
        expect(job?.dedupeKey).toBe("rss_sync")
      }),
    ).pipe(Effect.provide(TestLayer)),
  )

  it.effect("enqueue deduplicates active jobs", () =>
    withSeed(
      Effect.gen(function* () {
        const svc = yield* SchedulerService
        const first = yield* svc.enqueue({ _tag: "rss_sync" })
        expect(first).not.toBeNull()

        const second = yield* svc.enqueue({ _tag: "rss_sync" })
        expect(second).toBeNull()
      }),
    ).pipe(Effect.provide(TestLayer)),
  )

  it.effect("enqueue allows different dedupe keys", () =>
    withSeed(
      Effect.gen(function* () {
        const svc = yield* SchedulerService
        const a = yield* svc.enqueue({ _tag: "search_missing", movieId: 1 })
        const b = yield* svc.enqueue({ _tag: "search_missing", movieId: 2 })
        expect(a).not.toBeNull()
        expect(b).not.toBeNull()
      }),
    ).pipe(Effect.provide(TestLayer)),
  )

  it.effect("enqueue fails when job type is paused", () =>
    withSeed(
      Effect.gen(function* () {
        const svc = yield* SchedulerService
        yield* svc.pause("rss_sync")
        const error = yield* Effect.flip(svc.enqueue({ _tag: "rss_sync" }))
        expect(error._tag).toBe("SchedulerError")
        if (error._tag === "SchedulerError") {
          expect(error.reason).toBe("paused")
        }
      }),
    ).pipe(Effect.provide(TestLayer)),
  )

  it.effect("claimNext returns oldest pending job", () =>
    withSeed(
      Effect.gen(function* () {
        const svc = yield* SchedulerService
        yield* svc.enqueue({ _tag: "rss_sync" })
        yield* svc.enqueue({ _tag: "download_monitor" })

        const claimed = yield* svc.claimNext()
        expect(claimed).not.toBeNull()
        expect(claimed?.status).toBe("running")
        expect(claimed?.attempts).toBe(1)
      }),
    ).pipe(Effect.provide(TestLayer)),
  )

  it.effect("claimNext returns null when no pending jobs", () =>
    withSeed(
      Effect.gen(function* () {
        const svc = yield* SchedulerService
        const claimed = yield* svc.claimNext()
        expect(claimed).toBeNull()
      }),
    ).pipe(Effect.provide(TestLayer)),
  )

  it.effect("complete transitions running → completed", () =>
    withSeed(
      Effect.gen(function* () {
        const svc = yield* SchedulerService
        yield* svc.enqueue({ _tag: "rss_sync" })
        const claimed = yield* svc.claimNext()
        yield* svc.complete(claimed!.id)

        const jobs = yield* svc.listJobs({ status: "completed" })
        expect(jobs).toHaveLength(1)
        expect(jobs[0].completedAt).not.toBeNull()
      }),
    ).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fail retries when under maxAttempts", () =>
    withSeed(
      Effect.gen(function* () {
        const svc = yield* SchedulerService
        yield* svc.enqueue({ _tag: "rss_sync" })
        const claimed = yield* svc.claimNext()
        yield* svc.fail(claimed!.id, "test error")

        const jobs = yield* svc.listJobs({ jobType: "rss_sync" })
        expect(jobs).toHaveLength(1)
        // Back to pending for retry (attempts=1, maxAttempts=4)
        expect(jobs[0].status).toBe("pending")
        expect(jobs[0].errorMessage).toBe("test error")
      }),
    ).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fail dead-letters when at maxAttempts", () =>
    withSeed(
      Effect.gen(function* () {
        const svc = yield* SchedulerService
        // Zero out retry delay so claimNext finds retried jobs immediately
        yield* svc.updateConfig("rss_sync", { retryDelaySeconds: 0 })
        yield* svc.enqueue({ _tag: "rss_sync" })

        // Exhaust all attempts (maxAttempts = maxRetries+1 = 4)
        for (let i = 0; i < 4; i++) {
          const claimed = yield* svc.claimNext()
          if (!claimed) break
          yield* svc.fail(claimed.id, `error ${i}`)
        }

        const jobs = yield* svc.listJobs({ jobType: "rss_sync" })
        expect(jobs).toHaveLength(1)
        expect(jobs[0].status).toBe("dead")
      }),
    ).pipe(Effect.provide(TestLayer)),
  )

  it.effect("pause/resume toggles config", () =>
    withSeed(
      Effect.gen(function* () {
        const svc = yield* SchedulerService
        yield* svc.pause("rss_sync")

        const configs = yield* svc.getConfig()
        const rss = configs.find((c) => c.jobType === "rss_sync")
        expect(rss?.enabled).toBe(false)

        yield* svc.resume("rss_sync")
        const configs2 = yield* svc.getConfig()
        const rss2 = configs2.find((c) => c.jobType === "rss_sync")
        expect(rss2?.enabled).toBe(true)
      }),
    ).pipe(Effect.provide(TestLayer)),
  )

  it.effect("status returns per-type summary", () =>
    withSeed(
      Effect.gen(function* () {
        const svc = yield* SchedulerService
        yield* svc.enqueue({ _tag: "rss_sync" })

        const summaries = yield* svc.status()
        expect(summaries).toHaveLength(4)

        const rss = summaries.find((s) => s.jobType === "rss_sync")
        expect(rss?.activeCount).toBe(1)
        expect(rss?.enabled).toBe(true)
      }),
    ).pipe(Effect.provide(TestLayer)),
  )

  it.effect("updateConfig modifies interval", () =>
    withSeed(
      Effect.gen(function* () {
        const svc = yield* SchedulerService
        const updated = yield* svc.updateConfig("rss_sync", { intervalMinutes: 30 })
        expect(updated.intervalMinutes).toBe(30)
      }),
    ).pipe(Effect.provide(TestLayer)),
  )

  it.effect("completed job allows re-enqueue with same dedupe key", () =>
    withSeed(
      Effect.gen(function* () {
        const svc = yield* SchedulerService
        yield* svc.enqueue({ _tag: "rss_sync" })
        const claimed = yield* svc.claimNext()
        yield* svc.complete(claimed!.id)

        // Should allow re-enqueue since previous completed
        const second = yield* svc.enqueue({ _tag: "rss_sync" })
        expect(second).not.toBeNull()
      }),
    ).pipe(Effect.provide(TestLayer)),
  )
})
