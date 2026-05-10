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

      expect(downloadTypes).toEqual([
        "deluge",
        "nzbget",
        "qbittorrent",
        "sabnzbd",
        "torrent_blackhole",
        "transmission",
        "usenet_blackhole",
      ])
      expect(indexerTypes).toEqual(["cardigann_yaml", "newznab", "torznab"])
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

  it.effect("unregisters adapter types", () =>
    Effect.gen(function* () {
      const registry = yield* AdapterRegistry
      registry.registerDownloadClient(
        "temp-download",
        {
          displayName: "Temp",
          protocolAffinity: "any",
          defaultPort: 1,
          authModel: "none",
        },
        () => ({}) as never,
      )
      expect(
        registry.listDownloadClientTypes().some((entry) => entry.type === "temp-download"),
      ).toBe(true)

      registry.unregisterDownloadClient("temp-download")
      const error = yield* Effect.flip(registry.getDownloadClientFactory("temp-download"))
      expect(error._tag).toBe("ValidationError")
    }).pipe(Effect.provide(AdapterRegistryLive)),
  )
})
