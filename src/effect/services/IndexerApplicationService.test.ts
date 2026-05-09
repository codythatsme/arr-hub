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

function stubRemoteApplication() {
  const requests: Array<RemoteRequest> = []
  const remoteIndexers: Array<Record<string, unknown>> = []

  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    const method = init?.method ?? "GET"
    const body =
      typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null
    requests.push({ url, method, body })

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
            { name: "minimumSeeders", value: 0 },
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

    return new Response("not found", { status: 404 })
  })

  return requests
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
})
