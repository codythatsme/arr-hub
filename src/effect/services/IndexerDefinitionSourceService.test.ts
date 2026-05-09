import { createHash } from "node:crypto"

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

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function catalogManifest(entries: ReadonlyArray<Record<string, unknown>>): string {
  return JSON.stringify({ version: 1, sources: entries })
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
        const expectedSha256 = sha256Hex(yaml)
        expect(result).toMatchObject({
          definitionKey: "remote-cardigann",
          displayName: "Remote Cardigann",
          previousVersion: null,
          version: "remote-1",
          sourceSha256: expectedSha256,
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
        expect(refreshed.lastSha256).toBe(expectedSha256)

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

  it("accepts remote definitions when a pinned checksum matches", async () => {
    const yaml = remoteDefinitionYaml("remote-1")
    const checksum = sha256Hex(yaml)
    vi.stubGlobal("fetch", async () => new Response(yaml, { status: 200 }))

    await Effect.runPromise(
      Effect.gen(function* () {
        const sources = yield* IndexerDefinitionSourceService
        const source = yield* sources.add({
          name: "Pinned source",
          url: "https://definitions.example/pinned.yml",
          pinnedSha256: checksum.toUpperCase(),
        })
        expect(source.pinnedSha256).toBe(checksum)

        const result = yield* sources.refresh(source.id)
        expect(result).toMatchObject({
          definitionKey: "remote-cardigann",
          sourceSha256: checksum,
          action: "created",
        })

        const refreshed = yield* sources.getById(source.id)
        expect(refreshed.lastError).toBeNull()
        expect(refreshed.lastSha256).toBe(checksum)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  it("imports checksum-pinned definition sources from a catalog manifest", async () => {
    const definitionYaml = remoteDefinitionYaml("remote-1")
    const sourceChecksum = sha256Hex(definitionYaml)
    const manifest = catalogManifest([
      {
        name: "Catalog Remote",
        url: "https://definitions.example/catalog-remote.yml",
        sha256: sourceChecksum.toUpperCase(),
      },
    ])
    const manifestChecksum = sha256Hex(manifest)
    vi.stubGlobal("fetch", async () => new Response(manifest, { status: 200 }))

    await Effect.runPromise(
      Effect.gen(function* () {
        const sources = yield* IndexerDefinitionSourceService
        const imported = yield* sources.importCatalog({
          url: "https://catalog.example/index.json",
          pinnedSha256: manifestChecksum,
        })

        expect(imported).toMatchObject({
          manifestUrl: "https://catalog.example/index.json",
          manifestSha256: manifestChecksum,
          total: 1,
          created: 1,
          updated: 0,
          unchanged: 0,
        })
        expect(imported.sources[0]).toMatchObject({
          name: "Catalog Remote",
          url: "https://definitions.example/catalog-remote.yml",
          pinnedSha256: sourceChecksum,
          enabled: true,
          action: "created",
        })

        const listed = yield* sources.list()
        expect(listed).toHaveLength(1)
        expect(listed[0]).toMatchObject({
          name: "Catalog Remote",
          url: "https://definitions.example/catalog-remote.yml",
          pinnedSha256: sourceChecksum,
          enabled: true,
        })

        const unchanged = yield* sources.importCatalog({
          url: "https://catalog.example/index.json",
          pinnedSha256: manifestChecksum,
        })
        expect(unchanged).toMatchObject({
          created: 0,
          updated: 0,
          unchanged: 1,
        })
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  it("rejects catalog manifests when the pinned checksum does not match", async () => {
    const manifest = catalogManifest([
      {
        name: "Catalog Remote",
        url: "https://definitions.example/catalog-remote.yml",
        sha256: sha256Hex(remoteDefinitionYaml("remote-1")),
      },
    ])
    vi.stubGlobal("fetch", async () => new Response(manifest, { status: 200 }))

    await Effect.runPromise(
      Effect.gen(function* () {
        const sources = yield* IndexerDefinitionSourceService
        const error = yield* Effect.flip(
          sources.importCatalog({
            url: "https://catalog.example/index.json",
            pinnedSha256: "0".repeat(64),
          }),
        )

        expect(error._tag).toBe("IndexerDefinitionSourceError")
        if (error._tag === "IndexerDefinitionSourceError") {
          expect(error.reason).toBe("checksum_mismatch")
          expect(error.retryable).toBe(false)
        }
        expect(yield* sources.list()).toEqual([])
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  it("requires catalog manifests to include a checksum pin", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("fetch should not be called without a manifest pin")
    })

    await Effect.runPromise(
      Effect.gen(function* () {
        const sources = yield* IndexerDefinitionSourceService
        const error = yield* Effect.flip(
          sources.importCatalog({
            url: "https://catalog.example/index.json",
            pinnedSha256: "",
          }),
        )

        expect(error._tag).toBe("IndexerDefinitionSourceError")
        if (error._tag === "IndexerDefinitionSourceError") {
          expect(error.reason).toBe("checksum_mismatch")
          expect(error.message).toContain("required")
          expect(error.retryable).toBe(false)
        }
        expect(yield* sources.list()).toEqual([])
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  it("requires catalog manifest entries to include source checksums", async () => {
    const manifest = catalogManifest([
      {
        name: "Catalog Remote",
        url: "https://definitions.example/catalog-remote.yml",
      },
    ])
    const manifestChecksum = sha256Hex(manifest)
    vi.stubGlobal("fetch", async () => new Response(manifest, { status: 200 }))

    await Effect.runPromise(
      Effect.gen(function* () {
        const sources = yield* IndexerDefinitionSourceService
        const error = yield* Effect.flip(
          sources.importCatalog({
            url: "https://catalog.example/index.json",
            pinnedSha256: manifestChecksum,
          }),
        )

        expect(error._tag).toBe("IndexerDefinitionSourceError")
        if (error._tag === "IndexerDefinitionSourceError") {
          expect(error.reason).toBe("invalid_response")
          expect(error.retryable).toBe(false)
        }
        expect(yield* sources.list()).toEqual([])
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  it("rejects remote definitions when a pinned checksum does not match", async () => {
    const yaml = remoteDefinitionYaml("remote-1")
    vi.stubGlobal("fetch", async () => new Response(yaml, { status: 200 }))

    await Effect.runPromise(
      Effect.gen(function* () {
        const sources = yield* IndexerDefinitionSourceService
        const db = yield* Db
        const source = yield* sources.add({
          name: "Mismatched source",
          url: "https://definitions.example/mismatched.yml",
          pinnedSha256: "0".repeat(64),
        })

        const error = yield* Effect.flip(sources.refresh(source.id))
        expect(error._tag).toBe("IndexerDefinitionSourceError")
        if (error._tag === "IndexerDefinitionSourceError") {
          expect(error.reason).toBe("checksum_mismatch")
          expect(error.retryable).toBe(false)
        }

        const rows = yield* db
          .select()
          .from(indexerDefinitions)
          .where(eq(indexerDefinitions.definitionKey, "remote-cardigann"))
        expect(rows).toHaveLength(0)

        const failed = yield* sources.getById(source.id)
        expect(failed.lastCheckedAt).toBeInstanceOf(Date)
        expect(failed.lastError).toContain("SHA-256 checksum mismatch")
        expect(failed.lastSha256).toBeNull()
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

  it("refreshes all enabled sources and skips disabled sources", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response(remoteDefinitionYaml("remote-1"), { status: 200 }),
    )

    await Effect.runPromise(
      Effect.gen(function* () {
        const sources = yield* IndexerDefinitionSourceService

        yield* sources.add({
          name: "Enabled source",
          url: "https://definitions.example/enabled.yml",
        })
        const disabled = yield* sources.add({
          name: "Disabled source",
          url: "https://definitions.example/disabled.yml",
          enabled: false,
        })

        const summary = yield* sources.refreshEnabled()
        expect(summary).toMatchObject({
          total: 1,
          succeeded: 1,
          failed: 0,
        })
        expect(summary.results[0]).toMatchObject({
          definitionKey: "remote-cardigann",
          action: "created",
        })

        const skipped = yield* sources.getById(disabled.id)
        expect(skipped.lastCheckedAt).toBeNull()
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  it("continues enabled source refresh after per-source failures", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("broken")) return new Response("unavailable", { status: 500 })
      return new Response(remoteDefinitionYaml("remote-1"), { status: 200 })
    })

    await Effect.runPromise(
      Effect.gen(function* () {
        const sources = yield* IndexerDefinitionSourceService

        yield* sources.add({
          name: "Broken source",
          url: "https://definitions.example/broken.yml",
        })
        yield* sources.add({
          name: "Working source",
          url: "https://definitions.example/working.yml",
        })

        const summary = yield* sources.refreshEnabled()
        expect(summary).toMatchObject({
          total: 2,
          succeeded: 1,
          failed: 1,
        })
        expect(summary.errors[0]).toMatchObject({
          sourceName: "Broken source",
          reason: "connection_failed",
        })
        expect(summary.results[0]).toMatchObject({
          definitionKey: "remote-cardigann",
          action: "created",
        })
      }).pipe(Effect.provide(TestLayer)),
    )
  })
})
