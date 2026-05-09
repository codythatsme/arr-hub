import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"

import { IndexerApplicationService } from "#/effect/services/IndexerApplicationService"

import { syncEnabledIndexerApplications } from "./indexerApplicationSyncTrigger"

describe("indexersRouter helpers", () => {
  it("syncs enabled indexer applications after indexer changes", async () => {
    let calls = 0
    const layer = Layer.succeed(IndexerApplicationService, {
      add: () => Effect.die("not implemented"),
      list: () => Effect.die("not implemented"),
      getById: () => Effect.die("not implemented"),
      update: () => Effect.die("not implemented"),
      remove: () => Effect.die("not implemented"),
      sync: () => Effect.die("not implemented"),
      syncEnabled: () =>
        Effect.sync(() => {
          calls += 1
          return {
            syncedAt: new Date(),
            total: 0,
            succeeded: 0,
            failed: 0,
            results: [],
            errors: [],
          }
        }),
    })

    await Effect.runPromise(syncEnabledIndexerApplications.pipe(Effect.provide(layer)))

    expect(calls).toBe(1)
  })
})
