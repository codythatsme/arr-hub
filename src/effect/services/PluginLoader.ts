import { mkdir, readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { SqlError } from "@effect/sql/SqlError"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { plugins, type PluginCapability } from "#/db/schema"

import type { AdapterMetadata, DownloadClientConfig } from "../domain/downloadClient"
import type { IndexerAdapterMetadata, IndexerConfig } from "../domain/indexer"
import type { MediaServerAdapterMetadata, MediaServerConfig } from "../domain/mediaServer"
import { PluginError } from "../errors"
import type { AdapterFactory } from "./AdapterRegistry"
import {
  AdapterRegistry,
  type IndexerAdapterFactory,
  type MediaServerAdapterFactory,
} from "./AdapterRegistry"
import { Db } from "./Db"

export type PluginRow = typeof plugins.$inferSelect

export interface PluginManifest {
  readonly name: string
  readonly version: string
  readonly capabilities: ReadonlyArray<PluginCapability>
  readonly entrypoint: string
}

export interface PluginDownloadClientExport {
  readonly type?: string
  readonly metadata: AdapterMetadata
  readonly factory: AdapterFactory
}

export interface PluginIndexerExport {
  readonly type?: string
  readonly metadata: IndexerAdapterMetadata
  readonly factory: IndexerAdapterFactory
}

export interface PluginMediaServerExport {
  readonly type?: string
  readonly metadata: MediaServerAdapterMetadata
  readonly factory: MediaServerAdapterFactory
}

export interface PluginModule {
  readonly downloadClient?: PluginDownloadClientExport
  readonly indexer?: PluginIndexerExport
  readonly mediaServer?: PluginMediaServerExport
}

export interface PluginStatus extends PluginRow {
  readonly status: "disabled" | "error" | "loaded"
}

export interface PluginHealth {
  readonly name: string
  readonly enabled: boolean
  readonly status: PluginStatus["status"]
  readonly contractStatus: "not_loaded" | "valid" | "invalid"
  readonly capabilities: ReadonlyArray<PluginCapability>
  readonly errorMessage: string | null
}

export class PluginLoader extends Context.Tag("@arr-hub/PluginLoader")<
  PluginLoader,
  {
    readonly list: () => Effect.Effect<ReadonlyArray<PluginStatus>, SqlError>
    readonly scan: (
      directory?: string,
    ) => Effect.Effect<ReadonlyArray<PluginStatus>, SqlError | PluginError>
    readonly enable: (name: string) => Effect.Effect<PluginStatus, SqlError | PluginError>
    readonly disable: (name: string) => Effect.Effect<PluginStatus, SqlError | PluginError>
    readonly remove: (name: string) => Effect.Effect<void, SqlError | PluginError>
    readonly health: (name: string) => Effect.Effect<PluginHealth, SqlError | PluginError>
  }
>() {}

const DEFAULT_PLUGIN_DIR = path.resolve(process.cwd(), "plugins")
const CAPABILITIES: ReadonlySet<string> = new Set(["download_client", "indexer", "media_server"])

function statusFor(row: PluginRow): PluginStatus {
  return {
    ...row,
    status: row.errorMessage ? "error" : row.enabled ? "loaded" : "disabled",
  }
}

function pluginError(pluginName: string, reason: PluginError["reason"], message: string) {
  return new PluginError({ pluginName, reason, message })
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parseManifest(
  raw: string,
  fallbackName: string,
): Effect.Effect<PluginManifest, PluginError> {
  return Effect.gen(function* () {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      return yield* pluginError(
        fallbackName,
        "manifest_invalid",
        error instanceof Error ? error.message : "invalid JSON",
      )
    }

    if (!isObject(parsed)) {
      return yield* pluginError(fallbackName, "manifest_invalid", "manifest must be an object")
    }

    const name = parsed.name
    const version = parsed.version
    const entrypoint = parsed.entrypoint
    const capabilities = parsed.capabilities
    if (typeof name !== "string" || name.trim() === "") {
      return yield* pluginError(fallbackName, "manifest_invalid", "manifest name is required")
    }
    if (typeof version !== "string" || version.trim() === "") {
      return yield* pluginError(name, "manifest_invalid", "manifest version is required")
    }
    if (typeof entrypoint !== "string" || entrypoint.trim() === "") {
      return yield* pluginError(name, "manifest_invalid", "manifest entrypoint is required")
    }
    if (!Array.isArray(capabilities) || capabilities.length === 0) {
      return yield* pluginError(name, "manifest_invalid", "at least one capability is required")
    }
    for (const capability of capabilities) {
      if (typeof capability !== "string" || !CAPABILITIES.has(capability)) {
        return yield* pluginError(
          name,
          "manifest_invalid",
          `unknown capability: ${String(capability)}`,
        )
      }
    }

    return {
      name,
      version,
      entrypoint,
      capabilities: capabilities as ReadonlyArray<PluginCapability>,
    }
  })
}

function hasFunctions(adapter: unknown, methods: ReadonlyArray<string>): boolean {
  if (!isObject(adapter)) return false
  return methods.every((method) => typeof adapter[method] === "function")
}

function validateDownloadClient(
  pluginName: string,
  exported: PluginDownloadClientExport | undefined,
): Effect.Effect<string, PluginError> {
  return Effect.gen(function* () {
    if (!exported || typeof exported.factory !== "function" || !isObject(exported.metadata)) {
      return yield* pluginError(
        pluginName,
        "contract_violation",
        "downloadClient export is invalid",
      )
    }
    const type = exported.type ?? pluginName
    const adapter = exported.factory({
      id: 0,
      name: pluginName,
      type,
      host: "localhost",
      port: exported.metadata.defaultPort,
      username: "",
      password: "",
      useSsl: false,
      category: null,
      settings: { pollIntervalMs: 60000 },
    } satisfies DownloadClientConfig)
    if (
      !hasFunctions(adapter, [
        "testConnection",
        "addDownload",
        "getQueue",
        "removeDownload",
        "getHealth",
      ])
    ) {
      return yield* pluginError(
        pluginName,
        "contract_violation",
        "download client adapter methods are incomplete",
      )
    }
    return type
  })
}

function validateIndexer(
  pluginName: string,
  exported: PluginIndexerExport | undefined,
): Effect.Effect<string, PluginError> {
  return Effect.gen(function* () {
    if (!exported || typeof exported.factory !== "function" || !isObject(exported.metadata)) {
      return yield* pluginError(pluginName, "contract_violation", "indexer export is invalid")
    }
    const type = exported.type ?? pluginName
    const adapter = exported.factory({
      id: 0,
      name: pluginName,
      type,
      baseUrl: "http://localhost",
      apiKey: "",
      priority: 25,
      categories: [],
      protocol: exported.metadata.protocolAffinity,
    } satisfies IndexerConfig)
    if (!hasFunctions(adapter, ["testConnection", "search"])) {
      return yield* pluginError(
        pluginName,
        "contract_violation",
        "indexer adapter methods are incomplete",
      )
    }
    return type
  })
}

function validateMediaServer(
  pluginName: string,
  exported: PluginMediaServerExport | undefined,
): Effect.Effect<string, PluginError> {
  return Effect.gen(function* () {
    if (!exported || typeof exported.factory !== "function" || !isObject(exported.metadata)) {
      return yield* pluginError(pluginName, "contract_violation", "mediaServer export is invalid")
    }
    const type = exported.type ?? pluginName
    const adapter = exported.factory({
      id: 0,
      name: pluginName,
      type,
      host: "localhost",
      port: exported.metadata.defaultPort,
      token: "",
      useSsl: false,
      settings: { syncIntervalMs: 3600000, monitoringEnabled: false },
    } satisfies MediaServerConfig)
    if (
      !hasFunctions(adapter, [
        "testConnection",
        "getLibraries",
        "syncLibrary",
        "refreshLibrary",
        "getHealth",
        "getActiveSessions",
        "getSharedUsers",
      ])
    ) {
      return yield* pluginError(
        pluginName,
        "contract_violation",
        "media server adapter methods are incomplete",
      )
    }
    return type
  })
}

export const PluginLoaderLive = Layer.effect(
  PluginLoader,
  Effect.gen(function* () {
    const db = yield* Db
    const registry = yield* AdapterRegistry
    const registeredTypes = new Map<
      string,
      ReadonlyArray<{ capability: PluginCapability; type: string }>
    >()

    const getByName = (name: string): Effect.Effect<PluginRow, SqlError | PluginError> =>
      Effect.gen(function* () {
        const rows = yield* db.select().from(plugins).where(eq(plugins.name, name))
        const row = rows[0]
        if (!row) return yield* pluginError(name, "plugin_not_found", "plugin was not discovered")
        return row
      })

    const readManifest = (pluginPath: string, fallbackName: string) =>
      Effect.tryPromise({
        try: () => readFile(path.join(pluginPath, "plugin.json"), "utf8"),
        catch: (error) =>
          pluginError(
            fallbackName,
            "manifest_invalid",
            error instanceof Error ? error.message : "manifest read failed",
          ),
      }).pipe(Effect.flatMap((raw) => parseManifest(raw, fallbackName)))

    const importModule = (
      row: PluginRow,
      manifest: PluginManifest,
    ): Effect.Effect<PluginModule, PluginError> =>
      Effect.tryPromise({
        try: async () => {
          const entrypoint = path.resolve(row.path, manifest.entrypoint)
          await stat(entrypoint)
          const url = pathToFileURL(entrypoint)
          url.searchParams.set("mtime", String(Date.now()))
          return (await import(/* @vite-ignore */ url.href)) as PluginModule
        },
        catch: (error) =>
          pluginError(
            row.name,
            "load_failed",
            error instanceof Error ? error.message : "plugin import failed",
          ),
      })

    const unregister = (name: string) => {
      for (const registration of registeredTypes.get(name) ?? []) {
        if (registration.capability === "download_client")
          registry.unregisterDownloadClient(registration.type)
        if (registration.capability === "indexer") registry.unregisterIndexer(registration.type)
        if (registration.capability === "media_server")
          registry.unregisterMediaServer(registration.type)
      }
      registeredTypes.delete(name)
    }

    const ensureAvailable = (
      name: string,
      capability: PluginCapability,
      type: string,
    ): Effect.Effect<void, PluginError> => {
      const exists =
        capability === "download_client"
          ? registry.listDownloadClientTypes().some((entry) => entry.type === type)
          : capability === "indexer"
            ? registry.listIndexerTypes().some((entry) => entry.type === type)
            : registry.listMediaServerTypes().some((entry) => entry.type === type)
      return exists
        ? Effect.fail(
            pluginError(
              name,
              "plugin_already_registered",
              `adapter type is already registered: ${type}`,
            ),
          )
        : Effect.void
    }

    const load = (
      row: PluginRow,
    ): Effect.Effect<ReadonlyArray<{ capability: PluginCapability; type: string }>, PluginError> =>
      Effect.gen(function* () {
        unregister(row.name)
        const manifest = yield* readManifest(row.path, row.name)
        const module = yield* importModule(row, manifest)
        const registrations: Array<{ capability: PluginCapability; type: string }> = []

        for (const capability of manifest.capabilities) {
          if (capability === "download_client") {
            const type = yield* validateDownloadClient(row.name, module.downloadClient)
            yield* ensureAvailable(row.name, capability, type)
            registry.registerDownloadClient(
              type,
              module.downloadClient!.metadata,
              module.downloadClient!.factory,
            )
            registrations.push({ capability, type })
          }
          if (capability === "indexer") {
            const type = yield* validateIndexer(row.name, module.indexer)
            yield* ensureAvailable(row.name, capability, type)
            registry.registerIndexer(type, module.indexer!.metadata, module.indexer!.factory)
            registrations.push({ capability, type })
          }
          if (capability === "media_server") {
            const type = yield* validateMediaServer(row.name, module.mediaServer)
            yield* ensureAvailable(row.name, capability, type)
            registry.registerMediaServer(
              type,
              module.mediaServer!.metadata,
              module.mediaServer!.factory,
            )
            registrations.push({ capability, type })
          }
        }

        registeredTypes.set(row.name, registrations)
        return registrations
      }).pipe(
        Effect.catchAll((error) =>
          Effect.sync(() => unregister(row.name)).pipe(Effect.zipRight(Effect.fail(error))),
        ),
      )

    const upsertDiscovered = (
      values: Pick<PluginRow, "name" | "path" | "version" | "capabilities" | "errorMessage">,
    ) =>
      db
        .insert(plugins)
        .values({
          name: values.name,
          path: values.path,
          version: values.version,
          capabilities: values.capabilities,
          errorMessage: values.errorMessage,
        })
        .onConflictDoUpdate({
          target: plugins.name,
          set: {
            path: values.path,
            version: values.version,
            capabilities: values.capabilities,
            errorMessage: values.errorMessage,
            updatedAt: new Date(),
          },
        })

    return {
      list: () =>
        Effect.gen(function* () {
          const rows = yield* db.select().from(plugins).orderBy(plugins.name)
          return rows.map(statusFor)
        }),

      scan: (directory) =>
        Effect.gen(function* () {
          const root = path.resolve(
            directory ?? process.env.ARR_HUB_PLUGIN_DIR ?? DEFAULT_PLUGIN_DIR,
          )
          yield* Effect.tryPromise({
            try: () => mkdir(root, { recursive: true }),
            catch: (error) =>
              pluginError(
                root,
                "load_failed",
                error instanceof Error ? error.message : "plugin directory unavailable",
              ),
          })
          const entries = yield* Effect.tryPromise({
            try: () => readdir(root, { withFileTypes: true }),
            catch: (error) =>
              pluginError(
                root,
                "load_failed",
                error instanceof Error ? error.message : "plugin scan failed",
              ),
          })

          for (const entry of entries) {
            if (!entry.isDirectory()) continue
            const pluginPath = path.join(root, entry.name)
            const result = yield* Effect.either(readManifest(pluginPath, entry.name))
            if (result._tag === "Left") {
              yield* upsertDiscovered({
                name: entry.name,
                path: pluginPath,
                version: "unknown",
                capabilities: [],
                errorMessage: result.left.message,
              })
            } else {
              yield* upsertDiscovered({
                name: result.right.name,
                path: pluginPath,
                version: result.right.version,
                capabilities: result.right.capabilities,
                errorMessage: null,
              })
            }
          }

          const rows = yield* db.select().from(plugins).orderBy(plugins.name)
          return rows.map(statusFor)
        }),

      enable: (name) =>
        Effect.gen(function* () {
          const row = yield* getByName(name)
          const registrations = yield* load(row).pipe(
            Effect.catchAll((error) =>
              db
                .update(plugins)
                .set({ enabled: false, errorMessage: error.message, updatedAt: new Date() })
                .where(eq(plugins.name, name))
                .pipe(Effect.zipRight(Effect.fail(error))),
            ),
          )
          const [updated] = yield* db
            .update(plugins)
            .set({ enabled: true, loadedAt: new Date(), errorMessage: null, updatedAt: new Date() })
            .where(eq(plugins.name, name))
            .returning()
          registeredTypes.set(name, registrations)
          return statusFor(updated)
        }),

      disable: (name) =>
        Effect.gen(function* () {
          yield* getByName(name)
          unregister(name)
          const [updated] = yield* db
            .update(plugins)
            .set({ enabled: false, updatedAt: new Date() })
            .where(eq(plugins.name, name))
            .returning()
          return statusFor(updated)
        }),

      remove: (name) =>
        Effect.gen(function* () {
          yield* getByName(name)
          unregister(name)
          yield* db.delete(plugins).where(eq(plugins.name, name))
        }),

      health: (name) =>
        Effect.gen(function* () {
          const row = yield* getByName(name)
          const status = statusFor(row)
          const isRegistered = (registeredTypes.get(name)?.length ?? 0) > 0
          return {
            name: row.name,
            enabled: row.enabled,
            status: status.status,
            contractStatus: row.errorMessage ? "invalid" : isRegistered ? "valid" : "not_loaded",
            capabilities: row.capabilities,
            errorMessage: row.errorMessage,
          }
        }),
    }
  }),
)
