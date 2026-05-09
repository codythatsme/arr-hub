import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import { TestDbLive } from "#/effect/test/TestDb"

import type { IndexerConfig } from "../domain/indexer"
import { IndexerError } from "../errors"
import { AdapterRegistry, AdapterRegistryLive } from "./AdapterRegistry"
import { CryptoServiceLive } from "./CryptoService"
import { IndexerService, IndexerServiceLive } from "./IndexerService"

const TestLayer = IndexerServiceLive.pipe(
  Layer.provideMerge(CryptoServiceLive),
  Layer.provideMerge(AdapterRegistryLive),
  Layer.provideMerge(TestDbLive),
)

const VALID_INPUT = {
  name: "Test Indexer",
  type: "torznab" as const,
  baseUrl: "https://example.com",
  apiKey: "secret-key-123",
}

describe("IndexerService", () => {
  it.effect("add returns indexer with id and no health", () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const indexer = yield* svc.add(VALID_INPUT)
      expect(typeof indexer.id).toBe("number")
      expect(indexer.name).toBe("Test Indexer")
      expect(indexer.type).toBe("torznab")
      expect(indexer.baseUrl).toBe("https://example.com")
      expect(indexer.enabled).toBe(true)
      expect(indexer.priority).toBe(50)
      expect(indexer.categories).toEqual([])
      expect(indexer.health).toBeNull()
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("add never exposes API key", () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const indexer = yield* svc.add(VALID_INPUT)
      const json = JSON.stringify(indexer)
      expect(json).not.toContain("secret-key-123")
      expect(json).not.toContain("apiKey")
      expect(json).not.toContain("apiKeyEncrypted")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("add respects custom priority + categories", () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const indexer = yield* svc.add({
        ...VALID_INPUT,
        priority: 10,
        categories: [2000, 5000],
      })
      expect(indexer.priority).toBe(10)
      expect(indexer.categories).toEqual([2000, 5000])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("add supports Cardigann YAML indexers with a known definition", () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const indexer = yield* svc.add({
        ...VALID_INPUT,
        name: "Cardigann",
        type: "cardigann_yaml",
        definitionKey: "public-domain-movie-torrents",
      })

      expect(indexer.type).toBe("cardigann_yaml")
      expect(indexer.definitionKey).toBe("public-domain-movie-torrents")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("add requires a definition key for Cardigann YAML indexers", () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const error = yield* Effect.flip(
        svc.add({
          ...VALID_INPUT,
          type: "cardigann_yaml",
          definitionKey: null,
        }),
      )

      expect(error._tag).toBe("ValidationError")
      expect(error.message).toContain("require a definition key")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("refreshDefinitions reports created and unchanged definition versions", () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService

      const first = yield* svc.refreshDefinitions()
      const second = yield* svc.refreshDefinitions()

      expect(first).toMatchObject({
        total: 4,
        created: 4,
        updated: 0,
        unchanged: 0,
      })
      expect(first.definitions.map((definition) => definition.action)).toEqual([
        "created",
        "created",
        "created",
        "created",
      ])
      expect(second).toMatchObject({
        total: 4,
        created: 0,
        updated: 0,
        unchanged: 4,
      })
      expect(second.definitions.every((definition) => definition.previousVersion !== null)).toBe(
        true,
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("list returns all indexers ordered by priority", () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      yield* svc.add({ ...VALID_INPUT, name: "Low Priority", priority: 90 })
      yield* svc.add({ ...VALID_INPUT, name: "High Priority", priority: 1 })
      const all = yield* svc.list()
      expect(all).toHaveLength(2)
      expect(all[0].name).toBe("High Priority")
      expect(all[1].name).toBe("Low Priority")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("getById returns indexer", () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const added = yield* svc.add(VALID_INPUT)
      const found = yield* svc.getById(added.id)
      expect(found.id).toBe(added.id)
      expect(found.name).toBe("Test Indexer")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("getById with missing id fails with NotFoundError", () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const error = yield* Effect.flip(svc.getById(99999))
      expect(error._tag).toBe("NotFoundError")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("update modifies fields", () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const added = yield* svc.add(VALID_INPUT)
      const updated = yield* svc.update(added.id, {
        name: "Renamed",
        enabled: false,
        priority: 5,
      })
      expect(updated.name).toBe("Renamed")
      expect(updated.enabled).toBe(false)
      expect(updated.priority).toBe(5)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("update with new API key re-encrypts", () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const added = yield* svc.add(VALID_INPUT)
      const updated = yield* svc.update(added.id, { apiKey: "new-secret" })
      const json = JSON.stringify(updated)
      expect(json).not.toContain("new-secret")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("update with missing id fails with NotFoundError", () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const error = yield* Effect.flip(svc.update(99999, { name: "Nope" }))
      expect(error._tag).toBe("NotFoundError")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("remove succeeds then getById fails", () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const added = yield* svc.add(VALID_INPUT)
      yield* svc.remove(added.id)
      const error = yield* Effect.flip(svc.getById(added.id))
      expect(error._tag).toBe("NotFoundError")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("remove with missing id fails with NotFoundError", () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const error = yield* Effect.flip(svc.remove(99999))
      expect(error._tag).toBe("NotFoundError")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("search returns empty when no indexers", () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const result = yield* svc.search({ term: "test", type: "general" })
      expect(result.releases).toEqual([])
      expect(result.errors).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("search skips disabled indexers", () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      yield* svc.add({ ...VALID_INPUT, enabled: false })
      const result = yield* svc.search({ term: "test", type: "general" })
      // disabled indexer not contacted — no releases, no errors
      expect(result.releases).toEqual([])
      expect(result.errors).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("seeds generic and Cardigann-style definitions", () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      yield* svc.seedBuiltInDefinitions()
      yield* svc.seedBuiltInDefinitions()

      const definitions = yield* svc.listDefinitions()
      expect(definitions.map((definition) => definition.definitionKey).toSorted()).toEqual([
        "generic-newznab",
        "generic-torznab",
        "open-tv-torrents",
        "public-domain-movie-torrents",
      ])
      expect(
        definitions.find((definition) => definition.definitionKey === "generic-torznab"),
      ).toMatchObject({
        displayName: "Generic Torznab",
        protocol: "torrent",
        implementation: "torznab",
        supportsRss: true,
        supportsSearch: true,
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "open-tv-torrents"),
      ).toMatchObject({
        displayName: "Open TV Torrents",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://opentv.example",
        privacy: "public",
        tags: ["public", "tv"],
      })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("manages indexer proxies without exposing proxy secrets", () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const proxy = yield* svc.addProxy({
        name: "FlareSolverr",
        type: "flaresolverr",
        host: "http://flaresolverr:8191",
        password: "proxy-secret",
        settings: { flaresolverrTimeoutMs: 60_000, tags: ["cloudflare"] },
      })

      expect(proxy.type).toBe("flaresolverr")
      expect(JSON.stringify(proxy)).not.toContain("proxy-secret")

      const updated = yield* svc.updateProxy(proxy.id, { enabled: false, password: null })
      expect(updated.enabled).toBe(false)

      const proxies = yield* svc.listProxies()
      expect(proxies).toHaveLength(1)
      expect(proxies[0].name).toBe("FlareSolverr")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("passes enabled proxy configuration into indexer adapters", () =>
    Effect.gen(function* () {
      const registry = yield* AdapterRegistry
      let capturedProxy: IndexerConfig["proxy"] = undefined
      registry.registerIndexer(
        "mock-proxy-aware",
        { displayName: "Mock Proxy Aware", protocolAffinity: "torrent", authModel: "none" },
        (config) => {
          capturedProxy = config.proxy
          return {
            testConnection: () =>
              Effect.succeed({
                searchTypes: ["search"],
                categories: [{ id: 2000, name: "Movies" }],
              }),
            search: () => Effect.succeed([]),
          }
        },
      )

      const svc = yield* IndexerService
      const proxy = yield* svc.addProxy({
        name: "HTTP Proxy",
        type: "http",
        host: "proxy.local",
        port: 8080,
        username: "proxy-user",
        password: "proxy-secret",
        settings: { tags: ["private-trackers"] },
      })
      const indexer = yield* svc.add({
        ...VALID_INPUT,
        type: "mock-proxy-aware",
        proxyId: proxy.id,
        apiKey: "unused",
      })

      yield* svc.testConnection(indexer.id)

      expect(capturedProxy).toEqual({
        type: "http",
        host: "proxy.local",
        port: 8080,
        username: "proxy-user",
        password: "proxy-secret",
        settings: { tags: ["private-trackers"] },
      })
      expect(JSON.stringify(yield* svc.listProxies())).not.toContain("proxy-secret")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("records indexer search statistics and supports protocol filtering", () =>
    Effect.gen(function* () {
      const registry = yield* AdapterRegistry
      registry.registerIndexer(
        "mock-torrent",
        { displayName: "Mock Torrent", protocolAffinity: "torrent", authModel: "none" },
        (config) => ({
          testConnection: () =>
            Effect.succeed({
              searchTypes: ["search"],
              categories: [{ id: 2000, name: "Movies" }],
            }),
          search: () =>
            Effect.succeed([
              {
                title: "Example Movie 2025 1080p WEB-DL",
                indexerId: config.id,
                indexerName: config.name,
                indexerPriority: config.priority,
                size: 1_000,
                seeders: 42,
                leechers: 2,
                age: 1,
                downloadUrl: "https://example.com/download/1",
                infoUrl: "https://example.com/info/1",
                category: "2000",
                protocol: "torrent",
                publishedAt: new Date("2025-01-01T00:00:00Z"),
                infohash: "abc123",
                downloadFactor: 1,
                uploadFactor: 1,
              },
            ]),
        }),
      )
      registry.registerIndexer(
        "mock-usenet-fail",
        { displayName: "Mock Usenet", protocolAffinity: "usenet", authModel: "none" },
        (config) => ({
          testConnection: () =>
            Effect.succeed({
              searchTypes: ["search"],
              categories: [{ id: 2000, name: "Movies" }],
            }),
          search: () =>
            Effect.fail(
              new IndexerError({
                indexerId: config.id,
                indexerName: config.name,
                reason: "connection_failed",
                message: "offline",
                retryable: true,
              }),
            ),
        }),
      )

      const svc = yield* IndexerService
      yield* svc.add({
        ...VALID_INPUT,
        name: "Torrent",
        type: "mock-torrent",
        apiKey: "unused",
      })
      yield* svc.add({
        ...VALID_INPUT,
        name: "Usenet",
        type: "mock-usenet-fail",
        apiKey: "unused",
      })

      const torrentOnly = yield* svc.search({
        term: "example",
        type: "movie",
        protocol: "torrent",
      })
      expect(torrentOnly.releases).toHaveLength(1)
      expect(torrentOnly.errors).toHaveLength(0)

      const all = yield* svc.search({ term: "example", type: "movie" })
      expect(all.releases).toHaveLength(1)
      expect(all.errors).toHaveLength(1)

      const stats = yield* svc.listStats()
      expect(stats.find((item) => item.indexerName === "Torrent")).toMatchObject({
        totalSearches: 2,
        successfulSearches: 2,
        failedSearches: 0,
      })
      expect(stats.find((item) => item.indexerName === "Usenet")).toMatchObject({
        totalSearches: 1,
        successfulSearches: 0,
        failedSearches: 1,
      })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("backs off recently rate-limited indexers", () =>
    Effect.gen(function* () {
      const registry = yield* AdapterRegistry
      let calls = 0
      registry.registerIndexer(
        "mock-rate-limited",
        { displayName: "Mock Rate Limited", protocolAffinity: "torrent", authModel: "none" },
        (config) => ({
          testConnection: () => Effect.succeed({ searchTypes: ["search"], categories: [] }),
          search: () => {
            calls += 1
            return Effect.fail(
              new IndexerError({
                indexerId: config.id,
                indexerName: config.name,
                reason: "rate_limited",
                message: "slow down",
                retryable: true,
              }),
            )
          },
        }),
      )

      const svc = yield* IndexerService
      const indexer = yield* svc.add({
        ...VALID_INPUT,
        name: "Rate Limited",
        type: "mock-rate-limited",
        apiKey: "unused",
      })

      const first = yield* svc.search({ term: "example", type: "movie" })
      const second = yield* svc.search({ term: "example", type: "movie" })

      expect(first.errors).toHaveLength(1)
      expect(second.errors).toHaveLength(0)
      expect(second.releases).toHaveLength(0)
      expect(calls).toBe(1)

      const stats = yield* svc.listStats()
      expect(stats.find((item) => item.indexerId === indexer.id)).toMatchObject({
        totalSearches: 1,
        failedSearches: 1,
      })
      const withHealth = yield* svc.getById(indexer.id)
      expect(withHealth.enabled).toBe(true)
      expect(withHealth.health).toMatchObject({
        status: "unhealthy",
        errorMessage: "rate_limited: slow down",
      })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("disables indexers after auth failures", () =>
    Effect.gen(function* () {
      const registry = yield* AdapterRegistry
      let calls = 0
      registry.registerIndexer(
        "mock-auth-fail",
        { displayName: "Mock Auth Fail", protocolAffinity: "torrent", authModel: "API key" },
        (config) => ({
          testConnection: () => Effect.succeed({ searchTypes: ["search"], categories: [] }),
          search: () => {
            calls += 1
            return Effect.fail(
              new IndexerError({
                indexerId: config.id,
                indexerName: config.name,
                reason: "auth_failed",
                message: "invalid API key",
                retryable: false,
              }),
            )
          },
        }),
      )

      const svc = yield* IndexerService
      const indexer = yield* svc.add({
        ...VALID_INPUT,
        name: "Auth Fail",
        type: "mock-auth-fail",
        apiKey: "unused",
      })

      const first = yield* svc.search({ term: "example", type: "movie" })
      const second = yield* svc.search({ term: "example", type: "movie" })

      expect(first.errors).toHaveLength(1)
      expect(second.errors).toHaveLength(0)
      expect(calls).toBe(1)

      const withHealth = yield* svc.getById(indexer.id)
      expect(withHealth.enabled).toBe(false)
      expect(withHealth.health).toMatchObject({
        status: "unhealthy",
        errorMessage: "auth_failed: invalid API key",
      })
    }).pipe(Effect.provide(TestLayer)),
  )
})
