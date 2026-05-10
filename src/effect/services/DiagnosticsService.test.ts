import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import { rootFolders } from "#/db/schema"
import { Db } from "#/effect/services/Db"
import { TestDbLive } from "#/effect/test/TestDb"

import { DiagnosticsService, DiagnosticsServiceLive } from "./DiagnosticsService"
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
  listStats: () => Effect.succeed([]),
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
        priority: 50,
        enabled: true,
        settings: { pollIntervalMs: 5000 },
        createdAt: new Date(),
        updatedAt: new Date(),
        health: {
          status: "unhealthy",
          lastCheck: new Date(),
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
