import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import {
  downloadClients,
  downloadQueue,
  movies,
  remotePathMappings,
  rootFolders,
} from "#/db/schema"
import { Db } from "#/effect/services/Db"
import { TestDbLive } from "#/effect/test/TestDb"

import {
  compareSemanticVersions,
  DiagnosticsService,
  DiagnosticsServiceLive,
  systemClockSkewFailure,
  updateAvailabilityFailure,
} from "./DiagnosticsService"
import { DownloadClientService } from "./DownloadClientService"
import { IndexerService } from "./IndexerService"
import { MediaServerService } from "./MediaServerService"
import { SchedulerService, SchedulerServiceLive } from "./SchedulerService"

const mockIndexerCatalogMethods = {
  seedBuiltInDefinitions: () => Effect.void,
  refreshDefinitions: () =>
    Effect.succeed({
      total: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      refreshedAt: new Date(),
      definitions: [],
    }),
  listDefinitions: () => Effect.succeed([]),
  listStats: () =>
    Effect.succeed([
      {
        indexerId: 1,
        indexerName: "Indexer",
        totalSearches: 5,
        successfulSearches: 1,
        failedSearches: 4,
        totalRss: 4,
        successfulRss: 1,
        failedRss: 3,
        totalGrabs: 0,
        averageResponseTimeMs: 100,
        lastSearchAt: new Date(),
        lastRssAt: new Date(),
        lastGrabAt: null,
        queryLimitWindowStartedAt: null,
        queryLimitWindowSearches: 0,
        grabLimitWindowStartedAt: null,
        grabLimitWindowGrabs: 0,
      },
    ]),
  aggregateCapabilities: () => Effect.succeed({ searchTypes: [], categories: [] }),
  rss: () => Effect.succeed({ releases: [], errors: [] }),
  canGrab: () => Effect.succeed(true),
  recordGrab: () => Effect.void,
  addProxy: () => Effect.die("not implemented"),
  listProxies: () => Effect.succeed([]),
  updateProxy: () => Effect.die("not implemented"),
  removeProxy: () => Effect.die("not implemented"),
}

const MockIndexerService = Layer.succeed(IndexerService, {
  add: () => Effect.die("not implemented"),
  list: () =>
    Effect.succeed([
      {
        id: 1,
        name: "Indexer",
        type: "torznab",
        definitionKey: "generic-torznab",
        baseUrl: "http://indexer",
        proxyId: null,
        enabled: true,
        searchEnabled: true,
        rssEnabled: true,
        priority: 50,
        minimumSeeders: null,
        queryCooldownSeconds: null,
        queryLimitCount: null,
        queryLimitWindowSeconds: null,
        grabLimitCount: null,
        grabLimitWindowSeconds: null,
        categories: [],
        tags: [],
        capabilities: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        health: {
          status: "healthy",
          lastCheck: new Date(),
          errorMessage: null,
          responseTimeMs: 10,
        },
      },
    ]),
  getById: () => Effect.die("not implemented"),
  update: () => Effect.die("not implemented"),
  remove: () => Effect.die("not implemented"),
  testConnection: () => Effect.die("not implemented"),
  search: () => Effect.die("not implemented"),
  ...mockIndexerCatalogMethods,
  listTypes: () => [],
})

const MockDownloadClientService = Layer.succeed(DownloadClientService, {
  add: () => Effect.die("not implemented"),
  list: () =>
    Effect.succeed([
      {
        id: 1,
        name: "qBit",
        type: "qbittorrent",
        host: "localhost",
        port: 8080,
        username: "admin",
        useSsl: false,
        category: null,
        tags: [],
        priority: 50,
        enabled: true,
        settings: { pollIntervalMs: 5000 },
        createdAt: new Date(),
        updatedAt: new Date(),
        health: {
          status: "unhealthy",
          lastCheck: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          errorMessage: "connection refused",
          responseTimeMs: null,
        },
      },
    ]),
  getById: () => Effect.die("not implemented"),
  update: () => Effect.die("not implemented"),
  remove: () => Effect.die("not implemented"),
  testConnection: () => Effect.die("not implemented"),
  addDownload: () => Effect.die("not implemented"),
  getQueue: () => Effect.die("not implemented"),
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
  refreshLibrary: () => Effect.die("not implemented"),
  listTypes: () => [],
})

const BaseLayer = Layer.mergeAll(
  SchedulerServiceLive,
  MockIndexerService,
  MockDownloadClientService,
  MockMediaServerService,
).pipe(Layer.provideMerge(TestDbLive))

const TestLayer = DiagnosticsServiceLive.pipe(Layer.provideMerge(BaseLayer))

describe("DiagnosticsService", () => {
  it("compares deployment supplied update versions", () => {
    expect(compareSemanticVersions("1.2.3", "1.2.4")).toBeLessThan(0)
    expect(compareSemanticVersions("1.2.3", "1.2.3")).toBe(0)
    expect(compareSemanticVersions("1.2.4", "1.2.3")).toBeGreaterThan(0)
    expect(updateAvailabilityFailure("1.0.0", "1.1.0")).toEqual(
      expect.objectContaining({ type: "update_available" }),
    )
    expect(updateAvailabilityFailure("1.0.0", "latest")).toEqual(
      expect.objectContaining({ type: "update_metadata" }),
    )
  })

  it("detects local system clock jumps after startup", () => {
    expect(
      systemClockSkewFailure({
        startWallMs: 1_000,
        startMonotonicMs: 0,
        monotonicNowMs: 60_000,
        wallNowMs: 61_000,
      }),
    ).toBeNull()
    expect(
      systemClockSkewFailure({
        startWallMs: 1_000,
        startMonotonicMs: 0,
        monotonicNowMs: 60_000,
        wallNowMs: 1_000 + 25 * 60 * 60 * 1000,
      }),
    ).toEqual(expect.objectContaining({ type: "system_clock_skew" }))
  })

  it.effect("returns system status with DB counts and resource usage", () =>
    Effect.gen(function* () {
      const diagnostics = yield* DiagnosticsService
      const status = yield* diagnostics.status()

      expect(status.version.length).toBeGreaterThan(0)
      expect(status.uptimeSeconds).toBeGreaterThanOrEqual(0)
      expect(status.database.tableCounts.movies).toBe(0)
      expect(status.resources.heapTotalBytes).toBeGreaterThan(0)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("aggregates health without failing on unhealthy integrations", () =>
    Effect.gen(function* () {
      const diagnostics = yield* DiagnosticsService
      const health = yield* diagnostics.health()

      expect(health.status).toBe("unhealthy")
      expect(health.integrations.some((item) => item.type === "download_client")).toBe(true)
      expect(health.failures).toContainEqual(
        expect.objectContaining({
          type: "download_client_remove_completed",
        }),
      )
      expect(health.failures).toContainEqual(
        expect.objectContaining({
          type: "download_client_unavailable",
        }),
      )
      expect(health.failures).toContainEqual(
        expect.objectContaining({
          type: "download_client_health_stale",
        }),
      )
      expect(health.failures).toContainEqual(
        expect.objectContaining({
          type: "indexer_search_failures",
        }),
      )
      expect(health.failures).toContainEqual(
        expect.objectContaining({
          type: "indexer_rss_failures",
        }),
      )
      expect(health.failures).toContainEqual(
        expect.objectContaining({
          type: "root_folder",
          message: "no root folders are configured for media imports",
        }),
      )
      expect(health.integrations).toContainEqual(
        expect.objectContaining({
          type: "app_data",
          status: "healthy",
        }),
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("reports disabled import monitoring and completed downloads without output paths", () =>
    Effect.gen(function* () {
      const db = yield* Db
      const scheduler = yield* SchedulerService
      const diagnostics = yield* DiagnosticsService

      yield* scheduler.seedConfig()
      yield* scheduler.pause("download_monitor")
      const clientRows = yield* db
        .insert(downloadClients)
        .values({
          name: "qBit",
          type: "qbittorrent",
          host: "localhost",
          port: 8080,
          username: "admin",
          passwordEncrypted: "encrypted",
          settings: { pollIntervalMs: 5000 },
        })
        .returning()
      const movieRows = yield* db
        .insert(movies)
        .values({
          tmdbId: 1000,
          title: "Missing Output",
          year: 2026,
        })
        .returning()

      yield* db.insert(downloadQueue).values({
        downloadClientId: clientRows[0].id,
        movieId: movieRows[0].id,
        externalId: "missing-output",
        status: "completed",
        title: "Missing.Output.2026.1080p-GRP",
        outputPath: null,
      })

      const health = yield* diagnostics.health()

      expect(health.failures).toContainEqual(
        expect.objectContaining({
          type: "import_mechanism",
        }),
      )
      expect(health.failures).toContainEqual(
        expect.objectContaining({
          type: "import_output_missing",
        }),
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("reports inaccessible root folders as unhealthy", () =>
    Effect.gen(function* () {
      const db = yield* Db
      const diagnostics = yield* DiagnosticsService
      const missingPath = `${process.cwd()}/.tmp/missing-root-folder-for-diagnostics`

      yield* db.insert(rootFolders).values({ path: missingPath })

      const health = yield* diagnostics.health()

      expect(health.status).toBe("unhealthy")
      expect(health.integrations).toContainEqual(
        expect.objectContaining({
          type: "root_folder",
          name: missingPath,
          status: "unhealthy",
        }),
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("reports inaccessible remote path mapping targets as unhealthy", () =>
    Effect.gen(function* () {
      const db = yield* Db
      const diagnostics = yield* DiagnosticsService
      const missingPath = `${process.cwd()}/.tmp/missing-remote-path-target`

      yield* db.insert(remotePathMappings).values({
        remotePath: "/downloads",
        localPath: missingPath,
      })

      const health = yield* diagnostics.health()

      expect(health.status).toBe("unhealthy")
      expect(health.integrations).toContainEqual(
        expect.objectContaining({
          type: "remote_path_mapping",
          name: `/downloads -> ${missingPath}`,
          status: "unhealthy",
        }),
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("filters structured logs by level", () =>
    Effect.gen(function* () {
      const diagnostics = yield* DiagnosticsService
      yield* diagnostics.log("info", "started")
      yield* diagnostics.log("error", "failed")

      const entries = yield* diagnostics.logs({ level: "error", count: 10 })

      expect(entries).toHaveLength(1)
      expect(entries[0]?.message).toBe("failed")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("summarizes scheduler task states", () =>
    Effect.gen(function* () {
      const scheduler = yield* SchedulerService
      const diagnostics = yield* DiagnosticsService

      yield* scheduler.seedConfig()
      yield* scheduler.enqueue({ _tag: "rss_sync" })
      const tasks = yield* diagnostics.tasks()

      expect(tasks.pending).toBe(1)
      expect(tasks.byType.some((item) => item.jobType === "rss_sync")).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )
})
