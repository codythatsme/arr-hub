import { Context, Effect, Layer } from "effect"

import type {
  AdapterMetadata,
  DownloadClientConfig,
  DownloadClientType,
} from "../domain/downloadClient"
import { ValidationError } from "../errors"
import type { DownloadClientAdapter } from "./DownloadClientAdapter"
import { createQBittorrentAdapter, qbittorrentMetadata } from "./QBittorrentAdapter"
import { createSABnzbdAdapter, sabnzbdMetadata } from "./SABnzbdAdapter"

// ── Types ──

export type AdapterFactory = (config: DownloadClientConfig) => DownloadClientAdapter

export interface AdapterRegistryEntry {
  readonly metadata: AdapterMetadata
  readonly factory: AdapterFactory
}

// ── Service tag ──

export class AdapterRegistry extends Context.Tag("@arr-hub/AdapterRegistry")<
  AdapterRegistry,
  {
    readonly registerDownloadClient: (
      type: DownloadClientType,
      metadata: AdapterMetadata,
      factory: AdapterFactory,
    ) => void
    readonly getDownloadClientFactory: (
      type: DownloadClientType,
    ) => Effect.Effect<AdapterFactory, ValidationError>
    readonly listDownloadClientTypes: () => ReadonlyArray<{
      readonly type: DownloadClientType
      readonly metadata: AdapterMetadata
    }>
  }
>() {}

// ── Live implementation ──

export const AdapterRegistryLive = Layer.sync(AdapterRegistry, () => {
  const adapters = new Map<DownloadClientType, AdapterRegistryEntry>()

  const registry: Context.Tag.Service<typeof AdapterRegistry> = {
    registerDownloadClient: (type, metadata, factory) => {
      adapters.set(type, { metadata, factory })
    },

    getDownloadClientFactory: (type) => {
      const entry = adapters.get(type)
      if (!entry) {
        return Effect.fail(
          new ValidationError({ message: `unknown download client type: "${type}"` }),
        )
      }
      return Effect.succeed(entry.factory)
    },

    listDownloadClientTypes: () =>
      Array.from(adapters.entries()).map(([type, { metadata }]) => ({ type, metadata })),
  }

  // Register built-in adapters
  registry.registerDownloadClient("qbittorrent", qbittorrentMetadata, createQBittorrentAdapter)
  registry.registerDownloadClient("sabnzbd", sabnzbdMetadata, createSABnzbdAdapter)

  return registry
})
