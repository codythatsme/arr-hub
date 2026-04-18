import { describe, expect, it } from "@effect/vitest"
import { eq } from "drizzle-orm"
import { Effect, Layer, Ref } from "effect"

import {
  downloadClients,
  downloadQueue,
  episodes,
  mediaServerLibraries,
  mediaServers,
  movies,
  qualityProfiles,
  releaseDecisions,
  seasons,
  series,
} from "#/db/schema"
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
  listTypes: () => [],
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
  listTypes: () => [],
})

const BaseLayer = Layer.mergeAll(MockDownloadClientService, MockMediaServerService).pipe(
  Layer.provideMerge(TestDbLive),
)

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

// ── TV completion tests ──

interface RefreshCall {
  readonly serverId: number
  readonly libraryId: string
}

const makeTrackingMediaServer = (ref: Ref.Ref<ReadonlyArray<RefreshCall>>) =>
  Layer.succeed(MediaServerService, {
    add: () => Effect.die("not implemented"),
    list: () => Effect.succeed([]),
    getById: () => Effect.die("not implemented"),
    update: () => Effect.die("not implemented"),
    remove: () => Effect.die("not implemented"),
    testConnection: () => Effect.die("not implemented"),
    getLibraries: () => Effect.die("not implemented"),
    syncLibrary: () => Effect.die("not implemented"),
    refreshLibrary: (serverId, libraryId) =>
      Ref.update(ref, (calls) => [...calls, { serverId, libraryId }]),
    listTypes: () => [],
  })

function seedTvData() {
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

    yield* db.insert(series).values({
      tvdbId: 100,
      title: "Test Show",
      status: "wanted",
      monitored: true,
      qualityProfileId: 1,
    })

    yield* db.insert(seasons).values({ seriesId: 1, seasonNumber: 1, monitored: true })

    yield* db.insert(episodes).values([
      { seasonId: 1, tvdbId: 1001, title: "Ep1", episodeNumber: 1, monitored: true },
      { seasonId: 1, tvdbId: 1002, title: "Ep2", episodeNumber: 2, monitored: true },
    ])

    return { seriesId: 1, episodeIds: [1, 2] as const }
  })
}

describe("DownloadMonitor TV", () => {
  it.effect("applies episode completion: sets hasFile + quality, deletes queue row", () =>
    Effect.gen(function* () {
      const { seriesId, episodeIds } = yield* seedTvData()
      const db = yield* Db

      // Pre-record a decision so applyEpisodeCompletion can backfill quality
      yield* db.insert(releaseDecisions).values({
        mediaId: episodeIds[0],
        mediaType: "episode",
        candidateTitle: "Test.Show.S01E01.1080p.WEB-DL-GRP",
        qualityRank: 15,
        formatScore: 200,
        decision: "accepted",
      })

      yield* db.insert(downloadQueue).values({
        downloadClientId: 1,
        seriesId,
        episodeIds: [episodeIds[0]],
        externalId: "tv_hash_1",
        status: "completed",
        title: "Test.Show.S01E01.1080p.WEB-DL-GRP",
        sizeBytes: 1_500_000_000,
        progress: 1.0,
      })

      const monitor = yield* DownloadMonitor
      const completions = yield* monitor.checkCompletions()

      expect(completions).toHaveLength(1)
      expect(completions[0].movieId).toBeNull()
      expect(completions[0].seriesId).toBe(seriesId)
      expect(completions[0].episodeIds).toEqual([episodeIds[0]])

      const epRows = yield* db.select().from(episodes).where(eq(episodes.id, episodeIds[0]))
      expect(epRows[0].hasFile).toBe(true)
      expect(epRows[0].existingQualityRank).toBe(15)
      expect(epRows[0].existingFormatScore).toBe(200)

      const queueRows = yield* db.select().from(downloadQueue)
      expect(queueRows).toHaveLength(0)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("applies season-pack completion across all episode ids", () =>
    Effect.gen(function* () {
      const { seriesId, episodeIds } = yield* seedTvData()
      const db = yield* Db

      yield* db.insert(releaseDecisions).values({
        mediaId: 1, // season id
        mediaType: "season",
        candidateTitle: "Test.Show.S01.1080p.BluRay-GRP",
        qualityRank: 20,
        formatScore: 300,
        decision: "accepted",
      })

      yield* db.insert(downloadQueue).values({
        downloadClientId: 1,
        seriesId,
        episodeIds: [...episodeIds],
        externalId: "tv_hash_pack",
        status: "completed",
        title: "Test.Show.S01.1080p.BluRay-GRP",
        sizeBytes: 8_000_000_000,
        progress: 1.0,
      })

      const monitor = yield* DownloadMonitor
      const completions = yield* monitor.checkCompletions()

      expect(completions).toHaveLength(1)
      expect(completions[0].episodeIds).toEqual([...episodeIds])

      const epRows = yield* db.select().from(episodes)
      for (const row of epRows) {
        expect(row.hasFile).toBe(true)
        expect(row.existingQualityRank).toBe(20)
        expect(row.existingFormatScore).toBe(300)
      }
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("ignores queue rows with seriesId but empty episodeIds", () =>
    Effect.gen(function* () {
      const { seriesId } = yield* seedTvData()
      const db = yield* Db

      yield* db.insert(downloadQueue).values({
        downloadClientId: 1,
        seriesId,
        episodeIds: [],
        externalId: "tv_hash_empty",
        status: "completed",
        title: "Orphan",
        sizeBytes: 0,
        progress: 1.0,
      })

      const monitor = yield* DownloadMonitor
      const completions = yield* monitor.checkCompletions()
      expect(completions).toHaveLength(0)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("triggers show library refresh on TV completion", () =>
    Effect.gen(function* () {
      const ref = yield* Ref.make<ReadonlyArray<RefreshCall>>([])
      const TrackingLayer = DownloadMonitorLive.pipe(
        Layer.provideMerge(
          Layer.mergeAll(MockDownloadClientService, makeTrackingMediaServer(ref)).pipe(
            Layer.provideMerge(TestDbLive),
          ),
        ),
      )

      yield* Effect.gen(function* () {
        const { seriesId, episodeIds } = yield* seedTvData()
        const db = yield* Db

        yield* db.insert(mediaServers).values({
          name: "plex",
          type: "plex",
          host: "localhost",
          port: 32400,
          tokenEncrypted: "x",
          enabled: true,
        })
        yield* db.insert(mediaServerLibraries).values([
          {
            mediaServerId: 1,
            externalId: "show-lib",
            name: "TV",
            type: "show",
            enabled: true,
          },
          {
            mediaServerId: 1,
            externalId: "movie-lib",
            name: "Movies",
            type: "movie",
            enabled: true,
          },
        ])

        yield* db.insert(downloadQueue).values({
          downloadClientId: 1,
          seriesId,
          episodeIds: [episodeIds[0]],
          externalId: "tv_refresh",
          status: "completed",
          title: "Test.Show.S01E01.720p.HDTV-GRP",
          sizeBytes: 500_000_000,
          progress: 1.0,
        })

        const monitor = yield* DownloadMonitor
        yield* monitor.checkCompletions()

        const calls = yield* Ref.get(ref)
        // Only show library should refresh (no movie completion happened)
        expect(calls).toHaveLength(1)
        expect(calls[0].libraryId).toBe("show-lib")
      }).pipe(Effect.provide(TrackingLayer))
    }),
  )
})
