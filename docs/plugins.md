# ARR Hub Plugin Author Guide

ARR Hub plugins are trusted local JavaScript modules loaded in process. Install a plugin by placing a folder under `plugins/` or `ARR_HUB_PLUGIN_DIR`, then scan and enable it from Settings > Plugins.

Plugins can add adapter implementations for three capabilities:

- `download_client`
- `indexer`
- `media_server`

## Manifest

Each plugin folder must contain `plugin.json`.

```json
{
  "name": "example-plugin",
  "version": "1.0.0",
  "apiVersion": 1,
  "capabilities": ["download_client"],
  "capabilityVersions": {
    "download_client": 1
  },
  "entrypoint": "index.mjs"
}
```

`apiVersion` defaults to `1` when omitted. `capabilityVersions` also defaults each listed capability to `1`. ARR Hub rejects manifests that request unsupported API or capability contract versions.

## Module Exports

The entrypoint must export one object per listed capability. The `type` field is optional; when omitted ARR Hub uses the plugin name as the adapter type.

### Download Client

```js
import { Effect } from "effect"

export const downloadClient = {
  type: "example-download",
  metadata: {
    displayName: "Example Download",
    protocolAffinity: "any",
    defaultPort: 8080,
    authModel: "basic",
  },
  factory: (config) => ({
    testConnection: () =>
      Effect.succeed({
        connected: true,
        version: "1.0.0",
        freeSpaceBytes: null,
        errorMessage: null,
      }),
    addDownload: (releaseUrl, options) => Effect.succeed("external-id"),
    getQueue: () => Effect.succeed([]),
    removeDownload: (externalId, options) => Effect.void,
    getHealth: () =>
      Effect.succeed({
        connected: true,
        version: "1.0.0",
        freeSpaceBytes: null,
        errorMessage: null,
      }),
  }),
}
```

### Indexer

```js
export const indexer = {
  type: "example-indexer",
  metadata: {
    displayName: "Example Indexer",
    protocolAffinity: "torrent",
    authModel: "api_key",
  },
  factory: (config) => ({
    testConnection: () =>
      Effect.succeed({ searchTypes: ["movie", "tv", "general"], categories: [] }),
    search: (query) => Effect.succeed([]),
  }),
}
```

### Media Server

```js
export const mediaServer = {
  type: "example-server",
  metadata: {
    displayName: "Example Server",
    defaultPort: 8096,
    authModel: "token",
  },
  factory: (config) => ({
    testConnection: () => Effect.succeed({ connected: true, version: "1.0.0", errorMessage: null }),
    getLibraries: () => Effect.succeed([]),
    syncLibrary: () => Effect.succeed({ matched: 0, unmatched: 0 }),
    refreshLibrary: () => Effect.void,
    getHealth: () => Effect.succeed({ connected: true, version: "1.0.0", errorMessage: null }),
    getActiveSessions: () => Effect.succeed([]),
    getSharedUsers: () => Effect.succeed([]),
  }),
}
```

## Operational Notes

Plugins run with the same filesystem and network privileges as ARR Hub. Only install plugins from sources you trust. When a plugin fails manifest or contract validation, Settings > Plugins shows the contract state, stored error message, and recent plugin lifecycle log entries.
