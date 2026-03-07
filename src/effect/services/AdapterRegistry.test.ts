import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"

import { AdapterRegistry, AdapterRegistryLive } from "./AdapterRegistry"

describe("AdapterRegistry", () => {
  it.effect("lists built-in adapter types for all categories", () =>
    Effect.gen(function* () {
      const registry = yield* AdapterRegistry

      const downloadTypes = registry
        .listDownloadClientTypes()
        .map((x) => x.type)
        .toSorted()
      const indexerTypes = registry
        .listIndexerTypes()
        .map((x) => x.type)
        .toSorted()
      const mediaServerTypes = registry
        .listMediaServerTypes()
        .map((x) => x.type)
        .toSorted()

      expect(downloadTypes).toEqual(["qbittorrent", "sabnzbd"])
      expect(indexerTypes).toEqual(["newznab", "torznab"])
      expect(mediaServerTypes).toEqual(["jellyfin", "plex"])
    }).pipe(Effect.provide(AdapterRegistryLive)),
  )

  it.effect("resolves registered factories and rejects unknown types", () =>
    Effect.gen(function* () {
      const registry = yield* AdapterRegistry

      const qbFactory = yield* registry.getDownloadClientFactory("qbittorrent")
      expect(typeof qbFactory).toBe("function")

      const indexerFactory = yield* registry.getIndexerFactory("torznab")
      expect(typeof indexerFactory).toBe("function")

      const mediaFactory = yield* registry.getMediaServerFactory("plex")
      expect(typeof mediaFactory).toBe("function")

      const downloadError = yield* Effect.flip(registry.getDownloadClientFactory("unknown-client"))
      expect(downloadError._tag).toBe("ValidationError")

      const indexerError = yield* Effect.flip(registry.getIndexerFactory("unknown-indexer"))
      expect(indexerError._tag).toBe("ValidationError")

      const mediaError = yield* Effect.flip(registry.getMediaServerFactory("unknown-media"))
      expect(mediaError._tag).toBe("ValidationError")
    }).pipe(Effect.provide(AdapterRegistryLive)),
  )
})
