import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"

import { indexerDefinitions } from "#/db/schema"
import { Db } from "#/effect/services/Db"
import { TestDbLive } from "#/effect/test/TestDb"

import { AdapterRegistryLive } from "./AdapterRegistry"
import { CryptoServiceLive } from "./CryptoService"
import {
  IndexerDefinitionSourceService,
  IndexerDefinitionSourceServiceLive,
} from "./IndexerDefinitionSourceService"
import { IndexerService, IndexerServiceLive } from "./IndexerService"

const TestLayer = Layer.mergeAll(IndexerDefinitionSourceServiceLive, IndexerServiceLive).pipe(
  Layer.provideMerge(CryptoServiceLive),
  Layer.provideMerge(AdapterRegistryLive),
  Layer.provideMerge(TestDbLive),
)

function remoteDefinitionYaml(version: string): string {
  return `
id: remote-cardigann
name: Remote Cardigann
description: Remote Cardigann fixture.
type: public
links:
  - https://remote-cardigann.example
version: ${version}
tags:
  - remote
settings:
  - name: apiKey
    label: API key
    type: password
    required: false
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    search: [q]
    movie-search: [q, imdbid]
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        apikey: "{{ .Config.APIKey }}"
        t: "{{ .Query.Type }}"
        q: "{{ .Keywords }}"
        cat: "{{ .Categories }}"
`
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("IndexerDefinitionSourceService", () => {
  it("refreshes a remote Cardigann definition and makes it usable by indexers", async () => {
    const yaml = remoteDefinitionYaml("remote-1")
    vi.stubGlobal("fetch", async () => new Response(yaml, { status: 200 }))

    await Effect.runPromise(
      Effect.gen(function* () {
        const sources = yield* IndexerDefinitionSourceService
        const indexers = yield* IndexerService
        const db = yield* Db

        const source = yield* sources.add({
          name: "Remote source",
          url: "https://definitions.example/remote-cardigann.yml",
        })

        const result = yield* sources.refresh(source.id)
        expect(result).toMatchObject({
          definitionKey: "remote-cardigann",
          displayName: "Remote Cardigann",
          previousVersion: null,
          version: "remote-1",
          action: "created",
        })

        const [definition] = yield* db
          .select()
          .from(indexerDefinitions)
          .where(eq(indexerDefinitions.definitionKey, "remote-cardigann"))
        expect(definition.sourceYaml).toContain("id: remote-cardigann")

        const refreshed = yield* sources.getById(source.id)
        expect(refreshed.lastCheckedAt).toBeInstanceOf(Date)
        expect(refreshed.lastError).toBeNull()
        expect(refreshed.lastDefinitionKey).toBe("remote-cardigann")
        expect(refreshed.lastVersion).toBe("remote-1")

        const indexer = yield* indexers.add({
          name: "Remote Cardigann",
          type: "cardigann_yaml",
          definitionKey: "remote-cardigann",
          baseUrl: "https://remote-cardigann.example",
          apiKey: "definition-key",
        })
        const tested = yield* indexers.testConnection(indexer.id)
        expect(tested.capabilities?.searchTypes).toEqual(["search", "movie"])
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  it("reports unchanged and updated remote definition versions", async () => {
    let yaml = remoteDefinitionYaml("remote-1")
    vi.stubGlobal("fetch", async () => new Response(yaml, { status: 200 }))

    await Effect.runPromise(
      Effect.gen(function* () {
        const sources = yield* IndexerDefinitionSourceService
        const source = yield* sources.add({
          name: "Remote source",
          url: "https://definitions.example/remote-cardigann.yml",
        })

        yield* sources.refresh(source.id)
        const unchanged = yield* sources.refresh(source.id)
        expect(unchanged).toMatchObject({
          previousVersion: "remote-1",
          version: "remote-1",
          action: "unchanged",
        })

        yaml = remoteDefinitionYaml("remote-2")
        const updated = yield* sources.refresh(source.id)
        expect(updated).toMatchObject({
          previousVersion: "remote-1",
          version: "remote-2",
          action: "updated",
        })
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  it("records remote definition source failures", async () => {
    vi.stubGlobal("fetch", async () => new Response("unavailable", { status: 500 }))

    await Effect.runPromise(
      Effect.gen(function* () {
        const sources = yield* IndexerDefinitionSourceService
        const source = yield* sources.add({
          name: "Broken source",
          url: "https://definitions.example/broken.yml",
        })

        const error = yield* Effect.flip(sources.refresh(source.id))
        expect(error._tag).toBe("IndexerDefinitionSourceError")
        if (error._tag === "IndexerDefinitionSourceError") {
          expect(error.reason).toBe("connection_failed")
        }

        const failed = yield* sources.getById(source.id)
        expect(failed.lastCheckedAt).toBeInstanceOf(Date)
        expect(failed.lastError).toContain("HTTP 500")
      }).pipe(Effect.provide(TestLayer)),
    )
  })
})
