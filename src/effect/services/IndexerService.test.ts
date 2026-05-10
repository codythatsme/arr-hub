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
      expect(indexer.minimumSeeders).toBeNull()
      expect(indexer.queryCooldownSeconds).toBeNull()
      expect(indexer.queryLimitCount).toBeNull()
      expect(indexer.queryLimitWindowSeconds).toBeNull()
      expect(indexer.grabLimitCount).toBeNull()
      expect(indexer.grabLimitWindowSeconds).toBeNull()
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

  it.effect("add respects custom priority, categories, and policies", () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const indexer = yield* svc.add({
        ...VALID_INPUT,
        priority: 10,
        minimumSeeders: 5,
        queryCooldownSeconds: 30,
        queryLimitCount: 20,
        queryLimitWindowSeconds: 300,
        grabLimitCount: 10,
        grabLimitWindowSeconds: 600,
        categories: [2000, 5000],
      })
      expect(indexer.priority).toBe(10)
      expect(indexer.minimumSeeders).toBe(5)
      expect(indexer.queryCooldownSeconds).toBe(30)
      expect(indexer.queryLimitCount).toBe(20)
      expect(indexer.queryLimitWindowSeconds).toBe(300)
      expect(indexer.grabLimitCount).toBe(10)
      expect(indexer.grabLimitWindowSeconds).toBe(600)
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
        total: 56,
        created: 56,
        updated: 0,
        unchanged: 0,
      })
      expect(first.definitions.map((definition) => definition.action)).toEqual(
        Array(56).fill("created"),
      )
      expect(second).toMatchObject({
        total: 56,
        created: 0,
        updated: 0,
        unchanged: 56,
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
        minimumSeeders: 12,
        queryCooldownSeconds: 45,
        queryLimitCount: 3,
        queryLimitWindowSeconds: 120,
        grabLimitCount: 2,
        grabLimitWindowSeconds: 600,
      })
      expect(updated.name).toBe("Renamed")
      expect(updated.enabled).toBe(false)
      expect(updated.priority).toBe(5)
      expect(updated.minimumSeeders).toBe(12)
      expect(updated.queryCooldownSeconds).toBe(45)
      expect(updated.queryLimitCount).toBe(3)
      expect(updated.queryLimitWindowSeconds).toBe(120)
      expect(updated.grabLimitCount).toBe(2)
      expect(updated.grabLimitWindowSeconds).toBe(600)
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

  it.effect("passes encrypted definition config values into indexer adapters", () =>
    Effect.gen(function* () {
      const registry = yield* AdapterRegistry
      let capturedValues: IndexerConfig["configValues"] = undefined
      registry.registerIndexer(
        "mock-config-values",
        { displayName: "Mock Config Values", protocolAffinity: "torrent", authModel: "fields" },
        (config) => {
          capturedValues = config.configValues
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
      const added = yield* svc.add({
        ...VALID_INPUT,
        type: "mock-config-values",
        apiKey: "legacy-api-key",
        configValues: {
          username: "alice",
          cookie: "session=secret",
        },
      })
      expect(JSON.stringify(added)).not.toContain("session=secret")

      yield* svc.testConnection(added.id)
      expect(capturedValues).toEqual({
        username: "alice",
        cookie: "session=secret",
      })

      yield* svc.update(added.id, {
        configValues: {
          username: "bob",
        },
      })
      yield* svc.testConnection(added.id)
      expect(capturedValues).toEqual({
        username: "bob",
        cookie: "session=secret",
      })
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

  it.effect("honors per-indexer category restrictions during search", () =>
    Effect.gen(function* () {
      const registry = yield* AdapterRegistry
      const captured: Array<{
        readonly name: string
        readonly categories: ReadonlyArray<number> | undefined
      }> = []
      registry.registerIndexer(
        "mock-category-restricted",
        { displayName: "Mock Category Restricted", protocolAffinity: "torrent", authModel: "none" },
        (config) => ({
          testConnection: () => Effect.succeed({ searchTypes: ["search"], categories: [] }),
          search: (query) => {
            captured.push({ name: config.name, categories: query.categories })
            return Effect.succeed([
              {
                title: `${config.name} Result`,
                indexerId: config.id,
                indexerName: config.name,
                indexerPriority: config.priority,
                size: 1_000,
                seeders: 10,
                leechers: 0,
                age: 1,
                downloadUrl: `https://example.com/${config.id}`,
                infoUrl: null,
                category: String(query.categories?.[0] ?? ""),
                protocol: "torrent" as const,
                publishedAt: new Date("2025-01-01T00:00:00Z"),
                infohash: null,
                downloadFactor: 1,
                uploadFactor: 1,
              },
            ])
          },
        }),
      )

      const svc = yield* IndexerService
      yield* svc.add({
        ...VALID_INPUT,
        name: "Movie Only",
        type: "mock-category-restricted",
        apiKey: "unused",
        categories: [2000],
      })
      yield* svc.add({
        ...VALID_INPUT,
        name: "TV Only",
        type: "mock-category-restricted",
        apiKey: "unused",
        categories: [5000],
      })
      yield* svc.add({
        ...VALID_INPUT,
        name: "Unrestricted",
        type: "mock-category-restricted",
        apiKey: "unused",
        categories: [],
      })

      const movieSearch = yield* svc.search({
        term: "example",
        type: "movie",
        categories: [2000],
      })
      expect(movieSearch.releases.map((release) => release.indexerName)).toEqual([
        "Movie Only",
        "Unrestricted",
      ])
      expect(captured).toEqual([
        { name: "Movie Only", categories: [2000] },
        { name: "Unrestricted", categories: [2000] },
      ])
      const movieStats = yield* svc.listStats()
      expect(movieStats.map((item) => item.indexerName).toSorted()).toEqual([
        "Movie Only",
        "Unrestricted",
      ])

      captured.length = 0
      yield* svc.search({ term: "example", type: "general" })
      expect(captured).toEqual([
        { name: "Movie Only", categories: [2000] },
        { name: "TV Only", categories: [5000] },
        { name: "Unrestricted", categories: undefined },
      ])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("seeds generic and Cardigann-style definitions", () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      yield* svc.seedBuiltInDefinitions()
      yield* svc.seedBuiltInDefinitions()

      const definitions = yield* svc.listDefinitions()
      expect(definitions.map((definition) => definition.definitionKey).toSorted()).toEqual([
        "alpharatio",
        "anidex",
        "animebytes",
        "animetorrents",
        "animetosho",
        "bakabt",
        "beyond-hd",
        "bit-hdtv",
        "broadcasthe-net",
        "brokenstones",
        "cgpeers",
        "dicmusic",
        "filelist",
        "funfile",
        "gazellegames",
        "generic-newznab",
        "generic-torznab",
        "greatposterwall",
        "hd-space",
        "hd-torrents",
        "hdaccess",
        "hdbits",
        "immortalseed",
        "iptorrents",
        "knaben",
        "morethantv",
        "myanonamouse",
        "nebulance",
        "norbits",
        "nyaa",
        "open-tv-torrents",
        "orpheus",
        "passthepopcorn",
        "pixelhd",
        "pretome",
        "public-domain-movie-torrents",
        "redacted",
        "retroflix",
        "revolutiontt",
        "rutracker",
        "scenehd",
        "scenetime",
        "secret-cinema",
        "shazbat",
        "shizaproject",
        "speedapp",
        "speedcd",
        "subsplease",
        "toloka",
        "torrent-network",
        "torrentbytes",
        "torrentday",
        "torrents-csv",
        "torrentsyndikat",
        "xspeeds",
        "xthor",
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
      expect(definitions.find((definition) => definition.definitionKey === "nyaa")).toMatchObject({
        displayName: "Nyaa",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://nyaa.si/",
        privacy: "public",
        tags: ["public", "anime", "rss"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "animebytes"),
      ).toMatchObject({
        displayName: "AnimeBytes",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://animebytes.tv/",
        privacy: "private",
        supportsRss: true,
        tags: ["private", "anime", "movies", "tv", "music", "books", "games", "json", "passkey"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "animetorrents"),
      ).toMatchObject({
        displayName: "AnimeTorrents",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://animetorrents.me/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "anime", "movies", "tv", "music", "books", "html"],
      })
      expect(definitions.find((definition) => definition.definitionKey === "bakabt")).toMatchObject(
        {
          displayName: "BakaBT",
          protocol: "torrent",
          implementation: "cardigann_yaml",
          baseUrl: "https://bakabt.me/",
          privacy: "private",
          supportsRss: false,
          tags: ["private", "anime", "movies", "tv", "music", "books", "html"],
        },
      )
      expect(
        definitions.find((definition) => definition.definitionKey === "nebulance"),
      ).toMatchObject({
        displayName: "Nebulance",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://nebulance.io/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "tv", "json", "api"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "broadcasthe-net"),
      ).toMatchObject({
        displayName: "BroadcasTheNet",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://api.broadcasthe.net/",
        privacy: "private",
        supportsRss: true,
        tags: ["private", "tv", "json", "json-rpc", "api-key"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "shazbat"),
      ).toMatchObject({
        displayName: "Shazbat",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://www.shazbat.tube/",
        privacy: "private",
        supportsRss: true,
        tags: ["private", "tv", "scene", "html", "form-login"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "norbits"),
      ).toMatchObject({
        displayName: "NorBits",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://norbits.net/",
        privacy: "private",
        supportsRss: true,
        tags: ["private", "movies", "tv", "general", "html", "multi-step-login"],
      })
      expect(definitions.find((definition) => definition.definitionKey === "toloka")).toMatchObject(
        {
          displayName: "Toloka.to",
          protocol: "torrent",
          implementation: "cardigann_yaml",
          baseUrl: "https://toloka.to/",
          privacy: "semi_private",
          supportsRss: true,
          tags: [
            "semi-private",
            "movies",
            "tv",
            "audio",
            "books",
            "pc",
            "games",
            "html",
            "form-login",
          ],
        },
      )
      expect(
        definitions.find((definition) => definition.definitionKey === "rutracker"),
      ).toMatchObject({
        displayName: "RuTracker.org",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://rutracker.org/",
        privacy: "semi_private",
        supportsRss: true,
        tags: [
          "semi-private",
          "movies",
          "tv",
          "anime",
          "audio",
          "books",
          "pc",
          "games",
          "html",
          "post-login",
        ],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "myanonamouse"),
      ).toMatchObject({
        displayName: "MyAnonamouse",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://www.myanonamouse.net/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "books", "audiobooks", "json", "cookie-auth"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "gazellegames"),
      ).toMatchObject({
        displayName: "GazelleGames",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://gazellegames.net/",
        privacy: "private",
        supportsRss: true,
        tags: ["private", "games", "json", "api-key", "passkey"],
      })
      expect(definitions.find((definition) => definition.definitionKey === "anidex")).toMatchObject(
        {
          displayName: "Anidex",
          protocol: "torrent",
          implementation: "cardigann_yaml",
          baseUrl: "https://anidex.info/",
          privacy: "public",
          tags: ["public", "anime", "html"],
        },
      )
      expect(
        definitions.find((definition) => definition.definitionKey === "shizaproject"),
      ).toMatchObject({
        displayName: "ShizaProject",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://shiza-project.com/",
        privacy: "public",
        tags: ["public", "anime", "json", "graphql"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "torrents-csv"),
      ).toMatchObject({
        displayName: "TorrentsCSV",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://torrents-csv.com/",
        privacy: "public",
        supportsRss: false,
        tags: ["public", "general", "json"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "subsplease"),
      ).toMatchObject({
        displayName: "SubsPlease",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://subsplease.org/",
        privacy: "public",
        tags: ["public", "anime", "json"],
      })
      expect(definitions.find((definition) => definition.definitionKey === "knaben")).toMatchObject(
        {
          displayName: "Knaben",
          protocol: "torrent",
          implementation: "cardigann_yaml",
          baseUrl: "https://knaben.org/",
          privacy: "public",
          supportsRss: false,
          tags: ["public", "general", "json"],
        },
      )
      expect(
        definitions.find((definition) => definition.definitionKey === "torrentday"),
      ).toMatchObject({
        displayName: "TorrentDay",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://tday.love/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "general", "movies", "tv", "json"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "iptorrents"),
      ).toMatchObject({
        displayName: "IPTorrents",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://iptorrents.com/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "general", "movies", "tv", "html"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "retroflix"),
      ).toMatchObject({
        displayName: "RetroFlix",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://retroflix.club/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "movies", "tv", "json"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "speedapp"),
      ).toMatchObject({
        displayName: "SpeedApp.io",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://speedapp.io/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "general", "movies", "tv", "json"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "beyond-hd"),
      ).toMatchObject({
        displayName: "BeyondHD",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://beyond-hd.me/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "movies", "tv", "json"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "bit-hdtv"),
      ).toMatchObject({
        displayName: "BitHDTV",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://www.bit-hdtv.com/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "movies", "tv", "html"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "torrentbytes"),
      ).toMatchObject({
        displayName: "TorrentBytes",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://www.torrentbytes.net/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "general", "movies", "tv", "html"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "scenehd"),
      ).toMatchObject({
        displayName: "SceneHD",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://scenehd.org/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "movies", "tv", "music", "json", "api"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "torrentsyndikat"),
      ).toMatchObject({
        displayName: "TorrentSyndikat",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://torrent-syndikat.org/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "general", "movies", "tv", "music", "books", "json", "api"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "scenetime"),
      ).toMatchObject({
        displayName: "SceneTime",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://www.scenetime.com/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "general", "movies", "tv", "html"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "hd-space"),
      ).toMatchObject({
        displayName: "HD-Space",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://hd-space.org/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "movies", "tv", "html"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "speedcd"),
      ).toMatchObject({
        displayName: "SpeedCD",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://speed.cd/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "general", "movies", "tv", "html"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "hd-torrents"),
      ).toMatchObject({
        displayName: "HD-Torrents",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://hdts.ru/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "movies", "tv", "music", "html"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "funfile"),
      ).toMatchObject({
        displayName: "FunFile",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://www.funfile.org/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "general", "movies", "tv", "music", "books", "html"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "immortalseed"),
      ).toMatchObject({
        displayName: "ImmortalSeed",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://immortalseed.me/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "general", "movies", "tv", "music", "books", "html"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "xspeeds"),
      ).toMatchObject({
        displayName: "XSpeeds",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://www.xspeeds.eu/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "general", "movies", "tv", "music", "books", "html"],
      })
      expect(definitions.find((definition) => definition.definitionKey === "xthor")).toMatchObject({
        displayName: "Xthor",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://api.xthor.tk/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "general", "movies", "tv", "books", "json", "api"],
      })
      expect(definitions.find((definition) => definition.definitionKey === "hdbits")).toMatchObject(
        {
          displayName: "HDBits",
          protocol: "torrent",
          implementation: "cardigann_yaml",
          baseUrl: "https://hdbits.org/",
          privacy: "private",
          supportsRss: false,
          tags: ["private", "movies", "tv", "music", "json", "api"],
        },
      )
      expect(
        definitions.find((definition) => definition.definitionKey === "pixelhd"),
      ).toMatchObject({
        displayName: "PiXELHD",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://pixelhd.me/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "movies", "html"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "secret-cinema"),
      ).toMatchObject({
        displayName: "Secret Cinema",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://secret-cinema.pw/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "movies", "music", "json", "gazelle"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "filelist"),
      ).toMatchObject({
        displayName: "FileList.io",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://filelist.io/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "general", "movies", "tv", "music", "books", "json", "api"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "alpharatio"),
      ).toMatchObject({
        displayName: "AlphaRatio",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://alpharatio.cc/",
        privacy: "private",
        supportsRss: false,
        tags: [
          "private",
          "general",
          "movies",
          "tv",
          "music",
          "books",
          "games",
          "apps",
          "json",
          "gazelle",
        ],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "brokenstones"),
      ).toMatchObject({
        displayName: "BrokenStones",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://brokenstones.is/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "apps", "games", "music", "json", "gazelle"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "cgpeers"),
      ).toMatchObject({
        displayName: "CGPeers",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://cgpeers.to/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "apps", "games", "graphics", "json", "gazelle"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "dicmusic"),
      ).toMatchObject({
        displayName: "DICMusic",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://dicmusic.com/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "music", "apps", "json", "gazelle"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "greatposterwall"),
      ).toMatchObject({
        displayName: "GreatPosterWall",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://greatposterwall.com/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "movies", "json", "gazelle"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "orpheus"),
      ).toMatchObject({
        displayName: "Orpheus",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://orpheus.network/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "music", "books", "apps", "json", "gazelle", "api-key"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "passthepopcorn"),
      ).toMatchObject({
        displayName: "PassThePopcorn",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://passthepopcorn.me/",
        privacy: "private",
        supportsRss: true,
        tags: ["private", "movies", "json", "api-key"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "redacted"),
      ).toMatchObject({
        displayName: "Redacted",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://redacted.sh/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "music", "books", "apps", "json", "gazelle", "api-key"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "revolutiontt"),
      ).toMatchObject({
        displayName: "RevolutionTT",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://revott.me/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "general", "movies", "tv", "music", "books", "html"],
      })
      expect(
        definitions.find((definition) => definition.definitionKey === "pretome"),
      ).toMatchObject({
        displayName: "PreToMe",
        protocol: "torrent",
        implementation: "cardigann_yaml",
        baseUrl: "https://pretome.info/",
        privacy: "private",
        supportsRss: false,
        tags: ["private", "general", "movies", "tv", "music", "books", "html"],
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

  it.effect("filters torrent releases below the indexer minimum seeder policy", () =>
    Effect.gen(function* () {
      const registry = yield* AdapterRegistry
      registry.registerIndexer(
        "mock-seeder-policy",
        { displayName: "Mock Seeder Policy", protocolAffinity: "torrent", authModel: "none" },
        (config) => ({
          testConnection: () => Effect.succeed({ searchTypes: ["search"], categories: [] }),
          search: () =>
            Effect.succeed([
              {
                title: "Low Seeder Movie",
                indexerId: config.id,
                indexerName: config.name,
                indexerPriority: config.priority,
                size: 1_000,
                seeders: 2,
                leechers: 0,
                age: 1,
                downloadUrl: "https://example.com/low",
                infoUrl: null,
                category: "2000",
                protocol: "torrent",
                publishedAt: new Date("2025-01-01T00:00:00Z"),
                infohash: "low",
                downloadFactor: 1,
                uploadFactor: 1,
              },
              {
                title: "Healthy Seeder Movie",
                indexerId: config.id,
                indexerName: config.name,
                indexerPriority: config.priority,
                size: 1_000,
                seeders: 9,
                leechers: 0,
                age: 1,
                downloadUrl: "https://example.com/high",
                infoUrl: null,
                category: "2000",
                protocol: "torrent",
                publishedAt: new Date("2025-01-01T00:00:00Z"),
                infohash: "high",
                downloadFactor: 1,
                uploadFactor: 1,
              },
            ]),
        }),
      )

      const svc = yield* IndexerService
      yield* svc.add({
        ...VALID_INPUT,
        type: "mock-seeder-policy",
        apiKey: "unused",
        minimumSeeders: 5,
      })

      const result = yield* svc.search({ term: "example", type: "movie" })
      expect(result.errors).toHaveLength(0)
      expect(result.releases.map((release) => release.title)).toEqual(["Healthy Seeder Movie"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("skips indexers while their query cooldown policy is active", () =>
    Effect.gen(function* () {
      const registry = yield* AdapterRegistry
      let calls = 0
      registry.registerIndexer(
        "mock-query-cooldown",
        { displayName: "Mock Query Cooldown", protocolAffinity: "torrent", authModel: "none" },
        (config) => ({
          testConnection: () => Effect.succeed({ searchTypes: ["search"], categories: [] }),
          search: () => {
            calls += 1
            return Effect.succeed([
              {
                title: "Cooldown Movie",
                indexerId: config.id,
                indexerName: config.name,
                indexerPriority: config.priority,
                size: 1_000,
                seeders: 10,
                leechers: 0,
                age: 1,
                downloadUrl: "https://example.com/cooldown",
                infoUrl: null,
                category: "2000",
                protocol: "torrent",
                publishedAt: new Date("2025-01-01T00:00:00Z"),
                infohash: "cooldown",
                downloadFactor: 1,
                uploadFactor: 1,
              },
            ])
          },
        }),
      )

      const svc = yield* IndexerService
      const indexer = yield* svc.add({
        ...VALID_INPUT,
        type: "mock-query-cooldown",
        apiKey: "unused",
        queryCooldownSeconds: 60,
      })

      const first = yield* svc.search({ term: "example", type: "movie" })
      const second = yield* svc.search({ term: "example", type: "movie" })

      expect(first.releases).toHaveLength(1)
      expect(second.releases).toHaveLength(0)
      expect(second.errors).toHaveLength(0)
      expect(calls).toBe(1)

      const stats = yield* svc.listStats()
      expect(stats.find((item) => item.indexerId === indexer.id)).toMatchObject({
        totalSearches: 1,
        successfulSearches: 1,
      })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("skips indexers after their rolling query limit is exhausted", () =>
    Effect.gen(function* () {
      const registry = yield* AdapterRegistry
      let calls = 0
      registry.registerIndexer(
        "mock-query-limit",
        { displayName: "Mock Query Limit", protocolAffinity: "torrent", authModel: "none" },
        (config) => ({
          testConnection: () => Effect.succeed({ searchTypes: ["search"], categories: [] }),
          search: () => {
            calls += 1
            return Effect.succeed([
              {
                title: "Limited Movie",
                indexerId: config.id,
                indexerName: config.name,
                indexerPriority: config.priority,
                size: 1_000,
                seeders: 10,
                leechers: 0,
                age: 1,
                downloadUrl: "https://example.com/limited",
                infoUrl: null,
                category: "2000",
                protocol: "torrent",
                publishedAt: new Date("2025-01-01T00:00:00Z"),
                infohash: "limited",
                downloadFactor: 1,
                uploadFactor: 1,
              },
            ])
          },
        }),
      )

      const svc = yield* IndexerService
      const indexer = yield* svc.add({
        ...VALID_INPUT,
        type: "mock-query-limit",
        apiKey: "unused",
        queryLimitCount: 1,
        queryLimitWindowSeconds: 60,
      })

      const first = yield* svc.search({ term: "example", type: "movie" })
      const second = yield* svc.search({ term: "example", type: "movie" })

      expect(first.releases).toHaveLength(1)
      expect(second.releases).toHaveLength(0)
      expect(second.errors).toHaveLength(0)
      expect(calls).toBe(1)

      const stats = yield* svc.listStats()
      expect(stats.find((item) => item.indexerId === indexer.id)).toMatchObject({
        totalSearches: 1,
        successfulSearches: 1,
        queryLimitWindowSearches: 1,
      })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("tracks rolling grab limits for indexers", () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const indexer = yield* svc.add({
        ...VALID_INPUT,
        grabLimitCount: 1,
        grabLimitWindowSeconds: 60,
      })

      expect(yield* svc.canGrab(indexer.id)).toBe(true)

      yield* svc.recordGrab(indexer.id)

      expect(yield* svc.canGrab(indexer.id)).toBe(false)

      const stats = yield* svc.listStats()
      expect(stats.find((item) => item.indexerId === indexer.id)).toMatchObject({
        totalGrabs: 1,
        grabLimitWindowGrabs: 1,
      })
      expect(stats.find((item) => item.indexerId === indexer.id)?.lastGrabAt).toBeInstanceOf(Date)
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
