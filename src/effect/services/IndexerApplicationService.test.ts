import { Effect, Layer } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TestDbLive } from "#/effect/test/TestDb"

import { AdapterRegistryLive } from "./AdapterRegistry"
import { CryptoServiceLive } from "./CryptoService"
import {
  IndexerApplicationService,
  IndexerApplicationServiceLive,
} from "./IndexerApplicationService"
import { IndexerService, IndexerServiceLive } from "./IndexerService"

const TestLayer = IndexerApplicationServiceLive.pipe(
  Layer.provideMerge(IndexerServiceLive),
  Layer.provideMerge(CryptoServiceLive),
  Layer.provideMerge(AdapterRegistryLive),
  Layer.provideMerge(TestDbLive),
)

interface RemoteRequest {
  readonly url: URL
  readonly method: string
  readonly body: Record<string, unknown> | null
}

type StubRemoteRequests = Array<RemoteRequest> & {
  readonly remoteIndexers: Array<Record<string, unknown>>
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

function remoteField(body: Record<string, unknown>, name: string): unknown {
  const fields = (body.fields ?? []) as ReadonlyArray<{
    readonly name: string
    readonly value: unknown
  }>
  return fields.find((field) => field.name === name)?.value
}

function stubRemoteApplication(options?: { readonly failHosts?: ReadonlyArray<string> }) {
  const remoteIndexers: Array<Record<string, unknown>> = []
  const requests: StubRemoteRequests = Object.assign([] as Array<RemoteRequest>, {
    remoteIndexers,
  })
  const failHosts = new Set(options?.failHosts ?? [])

  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    const method = init?.method ?? "GET"
    const body =
      typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null
    requests.push({ url, method, body })

    if (failHosts.has(url.hostname)) return new Response("bad key", { status: 401 })

    if (url.pathname === "/api/v3/indexer/schema") {
      return jsonResponse([
        {
          implementation: "Torznab",
          configContract: "TorznabSettings",
          fields: [
            { name: "baseUrl", value: "" },
            { name: "apiPath", value: "/api" },
            { name: "apiKey", value: "" },
            { name: "categories", value: [] },
            { name: "animeCategories", value: [] },
            { name: "minimumSeeders", value: 0 },
            { name: "additionalParameters", value: "" },
          ],
        },
        {
          implementation: "Newznab",
          configContract: "NewznabSettings",
          fields: [
            { name: "baseUrl", value: "" },
            { name: "apiPath", value: "/api" },
            { name: "apiKey", value: "" },
            { name: "categories", value: [] },
            { name: "animeCategories", value: [] },
            { name: "additionalParameters", value: "" },
          ],
        },
      ])
    }

    if (url.pathname === "/api/v3/indexer" && method === "GET") {
      return jsonResponse(remoteIndexers)
    }

    if (url.pathname === "/api/v3/indexer" && method === "POST" && body) {
      const saved = { ...body, id: 321 }
      remoteIndexers.push(saved)
      return jsonResponse(saved)
    }

    if (url.pathname === "/api/v3/indexer/321" && method === "PUT" && body) {
      const saved = { ...body, id: 321 }
      remoteIndexers[0] = saved
      return jsonResponse(saved)
    }

    if (url.pathname === "/api/v3/indexer/321" && method === "DELETE") {
      remoteIndexers.splice(0, remoteIndexers.length)
      return new Response(null, { status: 204 })
    }

    return new Response("not found", { status: 404 })
  })

  return requests
}

function setRemoteField(
  indexer: Record<string, unknown>,
  name: string,
  value: unknown,
): Record<string, unknown> {
  const fields = (indexer.fields ?? []) as Array<Record<string, unknown>>
  const field = fields.find((candidate) => candidate.name === name)
  if (field) {
    field.value = value
  } else {
    fields.push({ name, value })
  }
  return { ...indexer, fields }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("IndexerApplicationService", () => {
  it("stores application credentials without exposing secrets", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const apps = yield* IndexerApplicationService
        const app = yield* apps.add({
          name: "Movies",
          type: "radarr",
          baseUrl: "http://radarr.test",
          apiKey: "remote-secret",
          syncBaseUrl: "http://arr-hub.test",
          syncApiKey: "local-secret",
        })

        expect(app.name).toBe("Movies")
        expect(app.settings.syncLevel).toBe("full")
        const json = JSON.stringify(app)
        expect(json).not.toContain("remote-secret")
        expect(json).not.toContain("local-secret")
        expect(json).not.toContain("apiKeyEncrypted")
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  it("syncs an aggregate Torznab indexer into Radarr", async () => {
    const requests = stubRemoteApplication()

    await Effect.runPromise(
      Effect.gen(function* () {
        const indexers = yield* IndexerService
        const apps = yield* IndexerApplicationService

        yield* indexers.add({
          name: "Torrent Movies",
          type: "torznab",
          baseUrl: "http://tracker.test",
          apiKey: "tracker-secret",
          categories: [2000, 2010, 5000],
        })

        const app = yield* apps.add({
          name: "Radarr",
          type: "radarr",
          baseUrl: "http://radarr.test",
          apiKey: "remote-key",
          syncBaseUrl: "http://arr-hub.test",
          syncApiKey: "arr-hub-key",
        })

        const result = yield* apps.sync(app.id)
        expect(result.created).toBe(1)
        expect(result.updated).toBe(0)
        expect(result.removed).toBe(0)
        expect(result.skipped).toBe(1)

        const post = requests.find((request) => request.method === "POST")
        expect(post?.url.searchParams.get("apikey")).toBe("remote-key")
        expect(post?.body?.implementation).toBe("Torznab")
        expect(remoteField(post?.body ?? {}, "baseUrl")).toBe(
          "http://arr-hub.test/api/indexers/aggregate/torznab",
        )
        expect(remoteField(post?.body ?? {}, "apiPath")).toBe("/api")
        expect(remoteField(post?.body ?? {}, "apiKey")).toBe("arr-hub-key")
        expect(remoteField(post?.body ?? {}, "categories")).toEqual([2000, 2010])

        const synced = yield* apps.getById(app.id)
        expect(synced.lastSyncedAt).toBeInstanceOf(Date)
        expect(synced.lastError).toBeNull()
        expect(synced.mappings).toHaveLength(1)
        expect(synced.mappings[0]).toMatchObject({
          protocol: "torrent",
          remoteIndexerId: 321,
          remoteIndexerName: "ARR Hub Torznab (Aggregate)",
        })
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  it("syncs torrent seed criteria into aggregate app indexers", async () => {
    const requests = stubRemoteApplication()

    await Effect.runPromise(
      Effect.gen(function* () {
        const indexers = yield* IndexerService
        const apps = yield* IndexerApplicationService

        yield* indexers.add({
          name: "Torrent Movies",
          type: "torznab",
          baseUrl: "http://tracker.test",
          apiKey: "tracker-secret",
          categories: [2000],
        })

        const app = yield* apps.add({
          name: "Radarr",
          type: "radarr",
          baseUrl: "http://radarr.test",
          apiKey: "remote-key",
          syncBaseUrl: "http://arr-hub.test",
          syncApiKey: "arr-hub-key",
          settings: {
            minimumSeeders: 8,
            seedRatio: 1.5,
            seedTimeMinutes: 1440,
            seasonPackSeedTimeMinutes: 10_080,
            rejectBlocklistedTorrentHashesWhileGrabbing: true,
          },
        })

        const result = yield* apps.sync(app.id)
        expect(result.created).toBe(1)

        const post = requests.find((request) => request.method === "POST")
        expect(remoteField(post?.body ?? {}, "minimumSeeders")).toBe(8)
        expect(remoteField(post?.body ?? {}, "seedCriteria.seedRatio")).toBe(1.5)
        expect(remoteField(post?.body ?? {}, "seedCriteria.seedTime")).toBe(1440)
        expect(remoteField(post?.body ?? {}, "seedCriteria.seasonPackSeedTime")).toBe(10_080)
        expect(remoteField(post?.body ?? {}, "rejectBlocklistedTorrentHashesWhileGrabbing")).toBe(
          true,
        )

        const synced = yield* apps.getById(app.id)
        expect(synced.settings).toMatchObject({
          minimumSeeders: 8,
          seedRatio: 1.5,
          seedTimeMinutes: 1440,
          seasonPackSeedTimeMinutes: 10_080,
          rejectBlocklistedTorrentHashesWhileGrabbing: true,
        })
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  it("syncs separate Sonarr standard and anime category filters", async () => {
    const requests = stubRemoteApplication()

    await Effect.runPromise(
      Effect.gen(function* () {
        const indexers = yield* IndexerService
        const apps = yield* IndexerApplicationService

        yield* indexers.add({
          name: "Torrent TV",
          type: "torznab",
          baseUrl: "http://tracker.test",
          apiKey: "tracker-secret",
          categories: [5000, 5030, 5070],
        })

        const app = yield* apps.add({
          name: "Sonarr",
          type: "sonarr",
          baseUrl: "http://sonarr.test",
          apiKey: "remote-key",
          syncBaseUrl: "http://arr-hub.test",
          syncApiKey: "arr-hub-key",
          settings: {
            syncCategories: [5030],
            animeSyncCategories: [5070],
          },
        })

        const result = yield* apps.sync(app.id)
        expect(result.created).toBe(1)

        const post = requests.find((request) => request.method === "POST")
        expect(remoteField(post?.body ?? {}, "categories")).toEqual([5030])
        expect(remoteField(post?.body ?? {}, "animeCategories")).toEqual([5070])

        const synced = yield* apps.getById(app.id)
        expect(synced.settings).toMatchObject({
          syncCategories: [5030],
          animeSyncCategories: [5070],
        })
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  it("preserves app-specific remote settings when updating aggregate app indexers", async () => {
    const requests = stubRemoteApplication()

    await Effect.runPromise(
      Effect.gen(function* () {
        const indexers = yield* IndexerService
        const apps = yield* IndexerApplicationService

        yield* indexers.add({
          name: "Torrent TV",
          type: "torznab",
          baseUrl: "http://tracker.test",
          apiKey: "tracker-secret",
          categories: [5000],
        })

        const app = yield* apps.add({
          name: "Sonarr",
          type: "sonarr",
          baseUrl: "http://sonarr.test",
          apiKey: "remote-key",
          syncBaseUrl: "http://arr-hub.test",
          syncApiKey: "arr-hub-key",
        })

        yield* apps.sync(app.id)

        requests.remoteIndexers[0] = setRemoteField(
          {
            ...requests.remoteIndexers[0],
            tags: [7, 9],
            downloadClientId: 12,
            seasonSearchMaximumSingleEpisodeAge: 14,
          },
          "additionalParameters",
          "&offset=1",
        )
        requests.remoteIndexers[0] = setRemoteField(
          requests.remoteIndexers[0],
          "baseUrl",
          "http://user-edited.example",
        )

        const result = yield* apps.sync(app.id)
        expect(result.updated).toBe(1)

        const put = requests.findLast((request) => request.method === "PUT")
        expect(put?.body?.tags).toEqual([7, 9])
        expect(put?.body?.downloadClientId).toBe(12)
        expect(put?.body?.seasonSearchMaximumSingleEpisodeAge).toBe(14)
        expect(remoteField(put?.body ?? {}, "additionalParameters")).toBe("&offset=1")
        expect(remoteField(put?.body ?? {}, "baseUrl")).toBe(
          "http://arr-hub.test/api/indexers/aggregate/torznab",
        )
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  it("removes stale remote aggregate indexers during full sync", async () => {
    const requests = stubRemoteApplication()

    await Effect.runPromise(
      Effect.gen(function* () {
        const indexers = yield* IndexerService
        const apps = yield* IndexerApplicationService

        const indexer = yield* indexers.add({
          name: "Torrent Movies",
          type: "torznab",
          baseUrl: "http://tracker.test",
          apiKey: "tracker-secret",
          categories: [2000],
        })

        const app = yield* apps.add({
          name: "Radarr",
          type: "radarr",
          baseUrl: "http://radarr.test",
          apiKey: "remote-key",
          syncBaseUrl: "http://arr-hub.test",
          syncApiKey: "arr-hub-key",
        })

        yield* apps.sync(app.id)
        yield* indexers.remove(indexer.id)

        const result = yield* apps.sync(app.id)
        expect(result.created).toBe(0)
        expect(result.updated).toBe(0)
        expect(result.removed).toBe(1)
        expect(result.skipped).toBe(1)
        expect(result.items).toContainEqual({
          protocol: "torrent",
          action: "removed",
          remoteIndexerId: 321,
          remoteIndexerName: "ARR Hub Torznab (Aggregate)",
          categories: [],
          reason: "no enabled indexers for protocol",
        })

        const deleteRequest = requests.find((request) => request.method === "DELETE")
        expect(deleteRequest?.url.pathname).toBe("/api/v3/indexer/321")
        expect(deleteRequest?.url.searchParams.get("apikey")).toBe("remote-key")

        const synced = yield* apps.getById(app.id)
        expect(synced.mappings).toHaveLength(0)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  it("keeps stale remote aggregate mappings during add-only sync", async () => {
    const requests = stubRemoteApplication()

    await Effect.runPromise(
      Effect.gen(function* () {
        const indexers = yield* IndexerService
        const apps = yield* IndexerApplicationService

        const indexer = yield* indexers.add({
          name: "Torrent Movies",
          type: "torznab",
          baseUrl: "http://tracker.test",
          apiKey: "tracker-secret",
          categories: [2000],
        })

        const app = yield* apps.add({
          name: "Radarr",
          type: "radarr",
          baseUrl: "http://radarr.test",
          apiKey: "remote-key",
          syncBaseUrl: "http://arr-hub.test",
          syncApiKey: "arr-hub-key",
          settings: { syncLevel: "add_only" },
        })

        yield* apps.sync(app.id)
        yield* indexers.remove(indexer.id)

        const result = yield* apps.sync(app.id)
        expect(result.created).toBe(0)
        expect(result.updated).toBe(0)
        expect(result.removed).toBe(0)
        expect(result.skipped).toBe(2)
        expect(result.items).toContainEqual({
          protocol: "torrent",
          action: "skipped",
          remoteIndexerId: 321,
          remoteIndexerName: "ARR Hub Torznab (Aggregate)",
          categories: [],
          reason: "no enabled indexers for protocol",
        })

        expect(requests.some((request) => request.method === "DELETE")).toBe(false)

        const synced = yield* apps.getById(app.id)
        expect(synced.mappings).toHaveLength(1)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  it("records remote application sync failures", async () => {
    vi.stubGlobal("fetch", async () => new Response("bad key", { status: 401 }))

    await Effect.runPromise(
      Effect.gen(function* () {
        const indexers = yield* IndexerService
        const apps = yield* IndexerApplicationService

        yield* indexers.add({
          name: "Torrent Movies",
          type: "torznab",
          baseUrl: "http://tracker.test",
          apiKey: "tracker-secret",
          categories: [2000],
        })

        const app = yield* apps.add({
          name: "Radarr",
          type: "radarr",
          baseUrl: "http://radarr.test",
          apiKey: "remote-key",
          syncBaseUrl: "http://arr-hub.test",
          syncApiKey: "arr-hub-key",
        })

        const error = yield* Effect.flip(apps.sync(app.id))
        expect(error._tag).toBe("IndexerApplicationError")
        if (error._tag === "IndexerApplicationError") {
          expect(error.reason).toBe("auth_failed")
        }

        const failed = yield* apps.getById(app.id)
        expect(failed.lastError).toContain("HTTP 401")
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  it("syncs enabled applications and continues after per-application failures", async () => {
    stubRemoteApplication({ failHosts: ["broken.test"] })

    await Effect.runPromise(
      Effect.gen(function* () {
        const indexers = yield* IndexerService
        const apps = yield* IndexerApplicationService

        yield* indexers.add({
          name: "Torrent Movies",
          type: "torznab",
          baseUrl: "http://tracker.test",
          apiKey: "tracker-secret",
          categories: [2000],
        })

        yield* apps.add({
          name: "Broken Radarr",
          type: "radarr",
          baseUrl: "http://broken.test",
          apiKey: "bad-key",
          syncBaseUrl: "http://arr-hub.test",
          syncApiKey: "arr-hub-key",
        })
        const disabled = yield* apps.add({
          name: "Disabled Radarr",
          type: "radarr",
          baseUrl: "http://disabled.test",
          apiKey: "remote-key",
          syncBaseUrl: "http://arr-hub.test",
          syncApiKey: "arr-hub-key",
          enabled: false,
        })
        const working = yield* apps.add({
          name: "Working Radarr",
          type: "radarr",
          baseUrl: "http://radarr.test",
          apiKey: "remote-key",
          syncBaseUrl: "http://arr-hub.test",
          syncApiKey: "arr-hub-key",
        })

        const summary = yield* apps.syncEnabled()
        expect(summary).toMatchObject({
          total: 2,
          succeeded: 1,
          failed: 1,
        })
        expect(summary.errors[0]).toMatchObject({
          applicationName: "Broken Radarr",
          reason: "auth_failed",
        })
        expect(summary.results[0]).toMatchObject({
          applicationId: working.id,
          created: 1,
        })

        const skipped = yield* apps.getById(disabled.id)
        expect(skipped.lastSyncedAt).toBeNull()
      }).pipe(Effect.provide(TestLayer)),
    )
  })
})
