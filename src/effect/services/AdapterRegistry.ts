import { Context, Effect, Layer } from "effect"

import type {
  AdapterMetadata,
  DownloadClientConfig,
  DownloadClientType,
} from "../domain/downloadClient"
import type { IndexerAdapterMetadata, IndexerConfig, IndexerType } from "../domain/indexer"
import type {
  MediaServerAdapterMetadata,
  MediaServerConfig,
  MediaServerType,
} from "../domain/mediaServer"
import { ValidationError } from "../errors"
import type { DownloadClientAdapter } from "./DownloadClientAdapter"
import type { IndexerAdapter } from "./IndexerAdapter"
import type { MediaServerAdapter } from "./MediaServerAdapter"
import { createPlexAdapter, plexMetadata } from "./PlexAdapter"
import { createQBittorrentAdapter, qbittorrentMetadata } from "./QBittorrentAdapter"
import { createSABnzbdAdapter, sabnzbdMetadata } from "./SABnzbdAdapter"
import { createTorznabAdapter, newznabMetadata, torznabMetadata } from "./TorznabAdapter"

// ── Types ──

export type AdapterFactory = (config: DownloadClientConfig) => DownloadClientAdapter
export type IndexerAdapterFactory = (config: IndexerConfig) => IndexerAdapter
export type MediaServerAdapterFactory = (config: MediaServerConfig) => MediaServerAdapter

export interface AdapterRegistryEntry {
  readonly metadata: AdapterMetadata
  readonly factory: AdapterFactory
}

export interface IndexerRegistryEntry {
  readonly metadata: IndexerAdapterMetadata
  readonly factory: IndexerAdapterFactory
}

export interface MediaServerRegistryEntry {
  readonly metadata: MediaServerAdapterMetadata
  readonly factory: MediaServerAdapterFactory
}

// ── Service tag ──

export class AdapterRegistry extends Context.Tag("@arr-hub/AdapterRegistry")<
  AdapterRegistry,
  {
    // Download clients
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

    // Indexers
    readonly registerIndexer: (
      type: IndexerType,
      metadata: IndexerAdapterMetadata,
      factory: IndexerAdapterFactory,
    ) => void
    readonly getIndexerFactory: (
      type: IndexerType,
    ) => Effect.Effect<IndexerAdapterFactory, ValidationError>
    readonly listIndexerTypes: () => ReadonlyArray<{
      readonly type: IndexerType
      readonly metadata: IndexerAdapterMetadata
    }>

    // Media servers
    readonly registerMediaServer: (
      type: MediaServerType,
      metadata: MediaServerAdapterMetadata,
      factory: MediaServerAdapterFactory,
    ) => void
    readonly getMediaServerFactory: (
      type: MediaServerType,
    ) => Effect.Effect<MediaServerAdapterFactory, ValidationError>
    readonly listMediaServerTypes: () => ReadonlyArray<{
      readonly type: MediaServerType
      readonly metadata: MediaServerAdapterMetadata
    }>
  }
>() {}

// ── Live implementation ──

export const AdapterRegistryLive = Layer.sync(AdapterRegistry, () => {
  const downloadAdapters = new Map<DownloadClientType, AdapterRegistryEntry>()
  const indexerAdapters = new Map<IndexerType, IndexerRegistryEntry>()
  const mediaServerAdapters = new Map<MediaServerType, MediaServerRegistryEntry>()

  const registry: Context.Tag.Service<typeof AdapterRegistry> = {
    // Download clients
    registerDownloadClient: (type, metadata, factory) => {
      downloadAdapters.set(type, { metadata, factory })
    },

    getDownloadClientFactory: (type) => {
      const entry = downloadAdapters.get(type)
      if (!entry) {
        return Effect.fail(
          new ValidationError({ message: `unknown download client type: "${type}"` }),
        )
      }
      return Effect.succeed(entry.factory)
    },

    listDownloadClientTypes: () =>
      Array.from(downloadAdapters.entries()).map(([type, { metadata }]) => ({ type, metadata })),

    // Indexers
    registerIndexer: (type, metadata, factory) => {
      indexerAdapters.set(type, { metadata, factory })
    },

    getIndexerFactory: (type) => {
      const entry = indexerAdapters.get(type)
      if (!entry) {
        return Effect.fail(new ValidationError({ message: `unknown indexer type: "${type}"` }))
      }
      return Effect.succeed(entry.factory)
    },

    listIndexerTypes: () =>
      Array.from(indexerAdapters.entries()).map(([type, { metadata }]) => ({ type, metadata })),

    // Media servers
    registerMediaServer: (type, metadata, factory) => {
      mediaServerAdapters.set(type, { metadata, factory })
    },

    getMediaServerFactory: (type) => {
      const entry = mediaServerAdapters.get(type)
      if (!entry) {
        return Effect.fail(new ValidationError({ message: `unknown media server type: "${type}"` }))
      }
      return Effect.succeed(entry.factory)
    },

    listMediaServerTypes: () =>
      Array.from(mediaServerAdapters.entries()).map(([type, { metadata }]) => ({ type, metadata })),
  }

  // Register built-in adapters
  registry.registerDownloadClient("qbittorrent", qbittorrentMetadata, createQBittorrentAdapter)
  registry.registerDownloadClient("sabnzbd", sabnzbdMetadata, createSABnzbdAdapter)
  registry.registerIndexer("torznab", torznabMetadata, createTorznabAdapter)
  registry.registerIndexer("newznab", newznabMetadata, createTorznabAdapter)
  registry.registerMediaServer("plex", plexMetadata, createPlexAdapter)

  return registry
})
