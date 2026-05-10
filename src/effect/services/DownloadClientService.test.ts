import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import { downloadClients, downloadHistory, downloadQueue } from "#/db/schema"
import type { DownloadStatus } from "#/effect/domain/downloadClient"
import { TestDbLive } from "#/effect/test/TestDb"

import { AdapterRegistry } from "./AdapterRegistry"
import { CryptoService } from "./CryptoService"
import { Db } from "./Db"
import { DownloadClientService, DownloadClientServiceLive } from "./DownloadClientService"

interface RemoveCall {
  readonly externalId: string
  readonly deleteFiles: boolean
}

const MockCrypto = Layer.succeed(CryptoService, {
  hashPassword: () => Effect.succeed("hash"),
  verifyPassword: () => Effect.succeed(true),
  generateToken: () => Effect.succeed("token"),
  hashToken: () => Effect.succeed("token-hash"),
  encrypt: (value) => Effect.succeed(`encrypted:${value}`),
  decrypt: () => Effect.succeed("password"),
})

function makeRegistry(status: DownloadStatus, removeCalls: Array<RemoveCall>) {
  return Layer.succeed(AdapterRegistry, {
    registerDownloadClient: () => undefined,
    unregisterDownloadClient: () => undefined,
    getDownloadClientFactory: () =>
      Effect.succeed(() => ({
        testConnection: () =>
          Effect.succeed({
            connected: true,
            version: "test",
            freeSpaceBytes: null,
            errorMessage: null,
          }),
        addDownload: () => Effect.succeed("external-id"),
        getQueue: () => Effect.succeed([status]),
        removeDownload: (externalId, deleteFiles) =>
          Effect.sync(() => {
            removeCalls.push({ externalId, deleteFiles })
          }),
        getHealth: () =>
          Effect.succeed({
            connected: true,
            version: "test",
            freeSpaceBytes: null,
            errorMessage: null,
          }),
      })),
    listDownloadClientTypes: () => [
      {
        type: "mock",
        metadata: {
          displayName: "Mock",
          protocolAffinity: "any",
          defaultPort: 1,
          authModel: "none",
        },
      },
    ],
    registerIndexer: () => undefined,
    unregisterIndexer: () => undefined,
    getIndexerFactory: () => Effect.die("not implemented"),
    listIndexerTypes: () => [],
    registerMediaServer: () => undefined,
    unregisterMediaServer: () => undefined,
    getMediaServerFactory: () => Effect.die("not implemented"),
    listMediaServerTypes: () => [],
  })
}

describe("DownloadClientService", () => {
  it.effect("removes failed downloads when the client policy is enabled", () => {
    const removeCalls: Array<RemoveCall> = []
    const failedStatus: DownloadStatus = {
      externalId: "failed_hash",
      title: "Failed.Release.2026.1080p",
      status: "failed",
      sizeBytes: 123,
      progressFraction: 0.42,
      etaSeconds: null,
      errorMessage: "download failed",
      outputPath: "/downloads/failed",
      downloadClientId: 1,
    }
    const TestLayer = DownloadClientServiceLive.pipe(
      Layer.provideMerge(
        Layer.mergeAll(TestDbLive, MockCrypto, makeRegistry(failedStatus, removeCalls)),
      ),
    )

    return Effect.gen(function* () {
      const db = yield* Db
      yield* db.insert(downloadClients).values({
        name: "mock-client",
        type: "mock",
        host: "localhost",
        port: 1,
        username: "",
        passwordEncrypted: "encrypted",
        settings: { pollIntervalMs: 5000, removeFailedDownloads: true },
      })

      const service = yield* DownloadClientService
      const statuses = yield* service.getQueue()

      expect(statuses).toHaveLength(1)
      expect(removeCalls).toEqual([{ externalId: "failed_hash", deleteFiles: false }])

      const queueRows = yield* db.select().from(downloadQueue)
      const historyRows = yield* db.select().from(downloadHistory)
      expect(queueRows).toHaveLength(0)
      expect(historyRows).toHaveLength(1)
      expect(historyRows[0]?.status).toBe("failed")
      expect(historyRows[0]?.externalId).toBe("failed_hash")
    }).pipe(Effect.provide(TestLayer))
  })
})
