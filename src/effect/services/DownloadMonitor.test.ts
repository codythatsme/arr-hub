import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import { downloadClients, downloadQueue, movies, qualityProfiles } from "#/db/schema"
import { Db } from "#/effect/services/Db"
import { TestDbLive } from "#/effect/test/TestDb"

import { DownloadClientService } from "./DownloadClientService"
import { DownloadMonitor, DownloadMonitorLive } from "./DownloadMonitor"
import { MediaServerService } from "./MediaServerService"

// ── Mocks ──

const MockDownloadClientService = Layer.succeed(DownloadClientService, {
  add: () => Effect.die("not implemented"),
  list: () => Effect.succeed([]),
  getById: () => Effect.die("not implemented"),
  update: () => Effect.die("not implemented"),
  remove: () => Effect.die("not implemented"),
  testConnection: () => Effect.die("not implemented"),
  addDownload: () => Effect.die("not implemented"),
  // getQueue polls clients — mock returns empty (we pre-populate downloadQueue)
  getQueue: () => Effect.succeed([]),
  removeDownload: () => Effect.die("not implemented"),
})

const MockMediaServerService = Layer.succeed(MediaServerService, {
  add: () => Effect.die("not implemented"),
  list: () => Effect.succeed([]),
  getById: () => Effect.die("not implemented"),
  update: () => Effect.die("not implemented"),
  remove: () => Effect.die("not implemented"),
  testConnection: () => Effect.die("not implemented"),
  getLibraries: () => Effect.die("not implemented"),
  syncLibrary: () => Effect.die("not implemented"),
  refreshLibrary: () => Effect.void,
})

const BaseLayer = Layer.mergeAll(
  MockDownloadClientService,
  MockMediaServerService,
).pipe(Layer.provideMerge(TestDbLive))

const TestLayer = DownloadMonitorLive.pipe(Layer.provideMerge(BaseLayer))

// ── Helpers ──

function seedData() {
  return Effect.gen(function* () {
    const db = yield* Db

    yield* db.insert(qualityProfiles).values({ name: "test-profile" })

    yield* db.insert(downloadClients).values({
      name: "test-qbit",
      type: "qbittorrent",
      host: "localhost",
      port: 8080,
      username: "admin",
      passwordEncrypted: "encrypted",
    })

    yield* db.insert(movies).values({
      tmdbId: 42,
      title: "Test Movie",
      status: "wanted",
      monitored: true,
      qualityProfileId: 1,
    })

    // Simulate a completed download linked to movie
    yield* db.insert(downloadQueue).values({
      downloadClientId: 1,
      movieId: 1,
      externalId: "hash_abc",
      status: "completed",
      title: "Test.Movie.2024.1080p",
      sizeBytes: 1_500_000_000,
      progress: 1.0,
    })
  })
}

// ── Tests ──

describe("DownloadMonitor", () => {
  it.effect("checkCompletions updates movie to available", () =>
    Effect.gen(function* () {
      yield* seedData()
      const monitor = yield* DownloadMonitor
      const completions = yield* monitor.checkCompletions()

      expect(completions).toHaveLength(1)
      expect(completions[0].movieId).toBe(1)
      expect(completions[0].externalId).toBe("hash_abc")

      // Verify movie status updated
      const db = yield* Db
      const movieRows = yield* db.select().from(movies)
      expect(movieRows[0].status).toBe("available")
      expect(movieRows[0].hasFile).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("checkCompletions removes completed queue rows", () =>
    Effect.gen(function* () {
      yield* seedData()
      const monitor = yield* DownloadMonitor
      yield* monitor.checkCompletions()

      const db = yield* Db
      const queueRows = yield* db.select().from(downloadQueue)
      expect(queueRows).toHaveLength(0)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("checkCompletions returns empty when nothing completed", () =>
    Effect.gen(function* () {
      const monitor = yield* DownloadMonitor
      const completions = yield* monitor.checkCompletions()
      expect(completions).toHaveLength(0)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("checkCompletions ignores queue rows without movieId", () =>
    Effect.gen(function* () {
      const db = yield* Db
      yield* db.insert(downloadClients).values({
        name: "test-qbit",
        type: "qbittorrent",
        host: "localhost",
        port: 8080,
        username: "admin",
        passwordEncrypted: "encrypted",
      })
      yield* db.insert(downloadQueue).values({
        downloadClientId: 1,
        movieId: null,
        externalId: "orphan_hash",
        status: "completed",
        title: "Orphan.Download",
        sizeBytes: 500_000_000,
        progress: 1.0,
      })

      const monitor = yield* DownloadMonitor
      const completions = yield* monitor.checkCompletions()
      expect(completions).toHaveLength(0)
    }).pipe(Effect.provide(TestLayer)),
  )
})
