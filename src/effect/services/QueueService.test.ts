import { describe, expect, it } from "@effect/vitest"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"

import {
  downloadClients,
  downloadQueue,
  movies,
  qualityProfiles,
  releaseDecisions,
} from "#/db/schema"
import { Db } from "#/effect/services/Db"
import { TestDbLive } from "#/effect/test/TestDb"

import { DownloadClientService } from "./DownloadClientService"
import { QueueService, QueueServiceLive } from "./QueueService"
import { SchedulerService, SchedulerServiceLive } from "./SchedulerService"

const MockDownloadClientService = Layer.succeed(DownloadClientService, {
  add: () => Effect.die("not implemented"),
  list: () => Effect.succeed([]),
  getById: () => Effect.die("not implemented"),
  update: () => Effect.die("not implemented"),
  remove: () => Effect.die("not implemented"),
  testConnection: () => Effect.die("not implemented"),
  addDownload: () => Effect.die("not implemented"),
  getQueue: () => Effect.die("not implemented"),
  removeDownload: () => Effect.void,
  listTypes: () => [],
})

const BaseLayer = Layer.mergeAll(SchedulerServiceLive, MockDownloadClientService).pipe(
  Layer.provideMerge(TestDbLive),
)

const TestLayer = QueueServiceLive.pipe(Layer.provideMerge(BaseLayer))

function seedQueue(status: "queued" | "downloading" | "importing" | "completed" | "failed") {
  return Effect.gen(function* () {
    const db = yield* Db
    const scheduler = yield* SchedulerService
    yield* scheduler.seedConfig()
    const profile = yield* db
      .insert(qualityProfiles)
      .values({ name: "Default" })
      .returning({ id: qualityProfiles.id })
    const movie = yield* db
      .insert(movies)
      .values({ tmdbId: 1, title: "Example Movie", qualityProfileId: profile[0].id })
      .returning({ id: movies.id })
    const client = yield* db
      .insert(downloadClients)
      .values({
        name: "qBit",
        type: "qbittorrent",
        host: "localhost",
        port: 8080,
        username: "admin",
        passwordEncrypted: "enc:pw",
      })
      .returning({ id: downloadClients.id })
    const queue = yield* db
      .insert(downloadQueue)
      .values({
        downloadClientId: client[0].id,
        movieId: movie[0].id,
        externalId: `hash-${status}`,
        title: "Example.Movie.2024.1080p-GROUP",
        status,
        sizeBytes: 1000,
        progress: status === "failed" ? 0.5 : 0.25,
        errorMessage: status === "failed" ? "download failed" : null,
      })
      .returning({ id: downloadQueue.id })

    return { queueId: queue[0].id, movieId: movie[0].id }
  })
}

describe("QueueService", () => {
  it.effect("lists queue rows grouped with media and client details", () =>
    Effect.gen(function* () {
      yield* seedQueue("downloading")
      const service = yield* QueueService
      const items = yield* service.list({ status: "downloading", mediaType: "movie" })

      expect(items).toHaveLength(1)
      expect(items[0]?.media.title).toBe("Example Movie")
      expect(items[0]?.downloadClient.name).toBe("qBit")
      expect(items[0]?.progress).toBe(0.25)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("retries a failed queue item and enqueues a movie search", () =>
    Effect.gen(function* () {
      const seeded = yield* seedQueue("failed")
      const service = yield* QueueService
      const retried = yield* service.retry(seeded.queueId)
      const scheduler = yield* SchedulerService
      const jobs = yield* scheduler.listJobs({ jobType: "search_missing" })

      expect(retried.status).toBe("queued")
      expect(retried.errorMessage).toBeNull()
      expect(jobs).toHaveLength(1)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("clears a queue item error without changing status", () =>
    Effect.gen(function* () {
      const seeded = yield* seedQueue("failed")
      const service = yield* QueueService
      const cleared = yield* service.clearError(seeded.queueId)

      expect(cleared.status).toBe("failed")
      expect(cleared.errorMessage).toBeNull()
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("blocklists a queue item and records decision rationale", () =>
    Effect.gen(function* () {
      const seeded = yield* seedQueue("failed")
      const service = yield* QueueService
      const blocked = yield* service.blocklist(seeded.queueId)
      const db = yield* Db
      const decisions = yield* db
        .select()
        .from(releaseDecisions)
        .where(eq(releaseDecisions.mediaId, seeded.movieId))

      expect(blocked.status).toBe("failed")
      expect(decisions).toHaveLength(1)
      expect(decisions[0]?.reasons[0]?.rule).toBe("queue_blocklist")
    }).pipe(Effect.provide(TestLayer)),
  )
})
