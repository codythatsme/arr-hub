import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import { TestDbLive } from "../test/TestDb"
import { AdapterRegistry, AdapterRegistryLive } from "./AdapterRegistry"
import { CryptoServiceLive } from "./CryptoService"
import { DownloadClientService, DownloadClientServiceLive } from "./DownloadClientService"
import { IndexerService, IndexerServiceLive } from "./IndexerService"
import { PluginLoader, PluginLoaderLive } from "./PluginLoader"

const TestLayer = Layer.mergeAll(
  PluginLoaderLive,
  DownloadClientServiceLive,
  IndexerServiceLive,
).pipe(
  Layer.provideMerge(CryptoServiceLive),
  Layer.provideMerge(AdapterRegistryLive),
  Layer.provideMerge(TestDbLive),
)

const withTempDir = Effect.acquireRelease(
  Effect.tryPromise(() => mkdtemp(path.join(tmpdir(), "arr-hub-plugin-test-"))),
  (dir) => Effect.tryPromise(() => rm(dir, { recursive: true, force: true })).pipe(Effect.orDie),
)

const validPluginModule = `
import { Effect } from "effect"

export const downloadClient = {
  type: "mock-download",
  metadata: {
    displayName: "Mock Download",
    protocolAffinity: "any",
    defaultPort: 1234,
    authModel: "none"
  },
  factory: () => ({
    testConnection: () => Effect.succeed({
      connected: true,
      version: "1.0.0",
      freeSpaceBytes: null,
      errorMessage: null
    }),
    addDownload: () => Effect.succeed("mock-id"),
    getQueue: () => Effect.succeed([]),
    removeDownload: () => Effect.void,
    getHealth: () => Effect.succeed({
      connected: true,
      version: "1.0.0",
      freeSpaceBytes: null,
      errorMessage: null
    })
  })
}

export const indexer = {
  type: "mock-indexer",
  metadata: {
    displayName: "Mock Indexer",
    protocolAffinity: "torrent",
    authModel: "api_key"
  },
  factory: (config) => ({
    testConnection: () => Effect.succeed({
      searchTypes: ["movie", "tv", "general"],
      categories: [{ id: 2000, name: "Movies" }]
    }),
    search: () => Effect.succeed([{
      title: "Example.Movie.2024.1080p.WEB-DL",
      indexerId: config.id,
      indexerName: config.name,
      indexerPriority: config.priority,
      size: 1000,
      seeders: 10,
      leechers: 1,
      age: 1,
      downloadUrl: "magnet:?xt=urn:btih:abc",
      infoUrl: null,
      category: "Movies",
      protocol: "torrent",
      publishedAt: new Date(0),
      infohash: "abc",
      downloadFactor: 1,
      uploadFactor: 1
    }])
  })
}
`

const invalidPluginModule = `
export const downloadClient = {
  type: "bad-download",
  metadata: {
    displayName: "Bad Download",
    protocolAffinity: "any",
    defaultPort: 1234,
    authModel: "none"
  },
  factory: () => ({})
}
`

const writePlugin = (
  root: string,
  folder: string,
  manifest: Record<string, unknown>,
  moduleSource: string,
) =>
  Effect.tryPromise(async () => {
    const pluginDir = path.join(root, folder)
    await mkdir(pluginDir, { recursive: true })
    await writeFile(path.join(pluginDir, "plugin.json"), JSON.stringify(manifest), "utf8")
    await writeFile(path.join(pluginDir, String(manifest.entrypoint)), moduleSource, "utf8")
  })

describe("PluginLoader", () => {
  it.scoped("discovers, enables, disables, and removes a valid plugin", () =>
    Effect.gen(function* () {
      const root = yield* withTempDir
      yield* writePlugin(
        root,
        "mock",
        {
          name: "mock-plugin",
          version: "1.0.0",
          capabilities: ["download_client", "indexer"],
          entrypoint: "index.mjs",
        },
        validPluginModule,
      )

      const loader = yield* PluginLoader
      const registry = yield* AdapterRegistry
      const scanned = yield* loader.scan(root)
      expect(scanned.map((plugin) => plugin.name)).toEqual(["mock-plugin"])
      expect(scanned[0].enabled).toBe(false)

      const enabled = yield* loader.enable("mock-plugin")
      expect(enabled.status).toBe("loaded")
      expect(
        registry.listDownloadClientTypes().some((entry) => entry.type === "mock-download"),
      ).toBe(true)
      expect(registry.listIndexerTypes().some((entry) => entry.type === "mock-indexer")).toBe(true)

      const downloadClients = yield* DownloadClientService
      const client = yield* downloadClients.add({
        name: "Mock Download",
        type: "mock-download",
        host: "localhost",
        port: 1234,
        username: "",
        password: "secret",
      })
      const externalId = yield* downloadClients.addDownload(client.id, "magnet:?xt=urn:btih:abc")
      expect(externalId).toBe("mock-id")

      const indexers = yield* IndexerService
      yield* indexers.add({
        name: "Mock Indexer",
        type: "mock-indexer",
        baseUrl: "http://localhost",
        apiKey: "secret",
      })
      const search = yield* indexers.search({ term: "example", type: "movie" })
      expect(search.releases.map((release) => release.title)).toEqual([
        "Example.Movie.2024.1080p.WEB-DL",
      ])

      const health = yield* loader.health("mock-plugin")
      expect(health.contractStatus).toBe("valid")

      const disabled = yield* loader.disable("mock-plugin")
      expect(disabled.status).toBe("disabled")
      const missing = yield* Effect.flip(registry.getDownloadClientFactory("mock-download"))
      expect(missing._tag).toBe("ValidationError")
      const missingIndexer = yield* Effect.flip(registry.getIndexerFactory("mock-indexer"))
      expect(missingIndexer._tag).toBe("ValidationError")

      yield* loader.remove("mock-plugin")
      expect(yield* loader.list()).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.scoped("records invalid contract errors with actionable messages", () =>
    Effect.gen(function* () {
      const root = yield* withTempDir
      yield* writePlugin(
        root,
        "bad",
        {
          name: "bad-plugin",
          version: "1.0.0",
          capabilities: ["download_client"],
          entrypoint: "index.mjs",
        },
        invalidPluginModule,
      )

      const loader = yield* PluginLoader
      yield* loader.scan(root)
      const error = yield* Effect.flip(loader.enable("bad-plugin"))
      expect(error._tag).toBe("PluginError")
      if (error._tag === "PluginError") {
        expect(error.reason).toBe("contract_violation")
      }

      const health = yield* loader.health("bad-plugin")
      expect(health.contractStatus).toBe("invalid")
      expect(health.errorMessage).toContain("methods are incomplete")
    }).pipe(Effect.provide(TestLayer)),
  )
})
