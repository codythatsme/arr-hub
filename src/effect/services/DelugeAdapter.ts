import { Buffer } from "node:buffer"
import { randomUUID } from "node:crypto"

import { Effect } from "effect"

import type {
  AdapterMetadata,
  DownloadClientConfig,
  DownloadStatus,
  NormalizedDownloadStatus,
} from "../domain/downloadClient"
import { DownloadClientError, type DownloadClientErrorReason } from "../errors"
import type { DownloadClientAdapter } from "./DownloadClientAdapter"

export const delugeMetadata: AdapterMetadata = {
  displayName: "Deluge",
  protocolAffinity: "torrent",
  defaultPort: 8112,
  authModel: "password",
}

interface DelugeRpcResponse<T> {
  readonly result?: T
  readonly error?: {
    readonly code?: number
    readonly Code?: number
    readonly message?: string
    readonly Message?: string
  } | null
}

interface DelugeUpdateUiResult {
  readonly torrents?: Record<string, Record<string, unknown>>
  readonly Torrents?: Record<string, Record<string, unknown>>
}

const REQUIRED_PROPERTIES = [
  "hash",
  "name",
  "state",
  "progress",
  "eta",
  "message",
  "is_finished",
  "save_path",
  "total_size",
  "total_done",
] as const

function baseUrl(config: DownloadClientConfig): string {
  const scheme = config.useSsl ? "https" : "http"
  return `${scheme}://${config.host}:${config.port}/json`
}

function makeError(
  config: DownloadClientConfig,
  reason: DownloadClientErrorReason,
  message: string,
  retryable: boolean,
): DownloadClientError {
  return new DownloadClientError({
    clientId: config.id,
    clientName: config.name,
    reason,
    message,
    retryable,
  })
}

function cookieHeaderFrom(response: Response): string | null {
  const headers = response.headers as Headers & { getSetCookie?: () => ReadonlyArray<string> }
  const cookies =
    headers.getSetCookie?.() ?? (headers.get("set-cookie") ? [headers.get("set-cookie")!] : [])
  const pairs = cookies.map((cookie) => cookie.split(";")[0]?.trim()).filter(Boolean)
  return pairs.length === 0 ? null : pairs.join("; ")
}

function numberField(record: Record<string, unknown>, ...keys: ReadonlyArray<string>): number {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return 0
}

function stringField(record: Record<string, unknown>, ...keys: ReadonlyArray<string>): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string") return value
    if (typeof value === "number") return String(value)
  }
  return ""
}

function boolField(record: Record<string, unknown>, ...keys: ReadonlyArray<string>): boolean {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "boolean") return value
    if (typeof value === "number") return value !== 0
    if (typeof value === "string") return value.toLowerCase() === "true"
  }
  return false
}

function filenameFromUrl(downloadUrl: string): string {
  try {
    const url = new URL(downloadUrl)
    const pathname = url.pathname.replace(/\/+$/, "")
    const lastSegment = pathname.split("/").findLast((segment) => segment.length > 0)
    const decoded = lastSegment ? decodeURIComponent(lastSegment) : ""
    if (decoded.length > 0) return decoded.endsWith(".torrent") ? decoded : `${decoded}.torrent`
  } catch {
    // Fall through to a deterministic default for non-URL inputs.
  }
  return "download.torrent"
}

function addOptions(savePath: string | undefined): Record<string, unknown> {
  const options: Record<string, unknown> = {
    add_paused: false,
    remove_at_ratio: false,
  }

  const downloadLocation = savePath?.trim()
  if (downloadLocation) options.download_location = downloadLocation

  return options
}

function normalizedProgress(torrent: Record<string, unknown>): number {
  const raw = numberField(torrent, "progress", "Progress")
  const fraction = raw > 1 ? raw / 100 : raw
  return Math.max(0, Math.min(1, fraction))
}

function outputPath(torrent: Record<string, unknown>): string | null {
  const savePath = stringField(torrent, "save_path", "DownloadPath").replace(/\/+$/, "")
  const name = stringField(torrent, "name", "Name").replaceAll(":", "_")
  if (!savePath || !name) return null
  return `${savePath}/${name}`
}

function mapStatus(torrent: Record<string, unknown>): NormalizedDownloadStatus {
  const state = stringField(torrent, "state", "State")
  if (state === "Error") return "failed"
  if (boolField(torrent, "is_finished", "IsFinished") && state !== "Checking") return "completed"
  if (state === "Queued" || state === "Paused") return "queued"
  return "downloading"
}

function torrentsFrom(result: DelugeUpdateUiResult): ReadonlyArray<Record<string, unknown>> {
  const torrents = result.torrents ?? result.Torrents ?? {}
  return Object.entries(torrents).map(([hash, torrent]) => Object.assign({ hash }, torrent))
}

export function createDelugeAdapter(config: DownloadClientConfig): DownloadClientAdapter {
  const url = baseUrl(config)
  let cookieHeader: string | null = null
  let authenticated = false

  const rawRpc = <T>(
    method: string,
    params: ReadonlyArray<unknown> = [],
  ): Effect.Effect<T, DownloadClientError> =>
    Effect.tryPromise({
      try: async () => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15_000)
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/json-rpc, application/json",
              ...(cookieHeader ? { cookie: cookieHeader } : {}),
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method,
              params,
              id: randomUUID().slice(0, 8),
            }),
            signal: controller.signal,
          })

          const nextCookie = cookieHeaderFrom(response)
          if (nextCookie) cookieHeader = nextCookie

          if (response.status === 401 || response.status === 403) {
            throw Object.assign(new Error(`HTTP ${response.status}`), { authFailed: true })
          }
          if (!response.ok) throw new Error(`HTTP ${response.status}`)

          const payload = (await response.json()) as DelugeRpcResponse<T>
          if (payload.error !== null && payload.error !== undefined) {
            const code = payload.error.code ?? payload.error.Code
            const message =
              payload.error.message ?? payload.error.Message ?? "Deluge JSON-RPC error"
            throw Object.assign(new Error(message), {
              authFailed: code === 1 || code === 2,
              invalidResponse: code !== 1 && code !== 2,
            })
          }

          return payload.result as T
        } finally {
          clearTimeout(timeout)
        }
      },
      catch: (error) => {
        if (error instanceof Error && error.name === "AbortError") {
          return makeError(config, "timeout", "request timed out after 15s", true)
        }
        if ((error as Record<string, unknown>).authFailed) {
          return makeError(config, "auth_failed", "invalid Deluge password", false)
        }
        if ((error as Record<string, unknown>).invalidResponse) {
          return makeError(
            config,
            "invalid_response",
            error instanceof Error ? error.message : "invalid Deluge response",
            false,
          )
        }
        return makeError(
          config,
          "connection_refused",
          error instanceof Error ? error.message : "request failed",
          true,
        )
      },
    })

  const connectDaemon = (): Effect.Effect<void, DownloadClientError> =>
    Effect.gen(function* () {
      const connected = yield* rawRpc<boolean>("web.connected")
      if (connected) return

      const hosts = yield* rawRpc<ReadonlyArray<ReadonlyArray<unknown>>>("web.get_hosts")
      const host = hosts.find((entry) => entry[1] === "127.0.0.1") ?? hosts[0]
      const hostId = host?.[0]

      if (hostId === undefined) {
        return yield* makeError(config, "invalid_response", "Deluge has no daemon hosts", false)
      }

      yield* rawRpc<unknown>("web.connect", [hostId])
    })

  const authenticate = (force = false): Effect.Effect<void, DownloadClientError> =>
    Effect.gen(function* () {
      if (authenticated && !force) return

      if (force) {
        authenticated = false
        cookieHeader = null
      }

      const ok = yield* rawRpc<boolean>("auth.login", [config.password])
      if (!ok) {
        return yield* makeError(config, "auth_failed", "invalid Deluge password", false)
      }

      authenticated = true
      yield* connectDaemon()
    })

  const rpcRequest = <T>(
    method: string,
    params: ReadonlyArray<unknown> = [],
  ): Effect.Effect<T, DownloadClientError> =>
    Effect.gen(function* () {
      yield* authenticate()

      return yield* rawRpc<T>(method, params).pipe(
        Effect.catchAll((error) => {
          if (error.reason !== "auth_failed") return Effect.fail(error)
          return Effect.gen(function* () {
            yield* authenticate(true)
            return yield* rawRpc<T>(method, params)
          })
        }),
      )
    })

  const getMethods = () => rpcRequest<ReadonlyArray<string>>("system.listMethods")
  const getVersion = () =>
    Effect.gen(function* () {
      const methods = yield* getMethods()
      if (methods.includes("daemon.get_version"))
        return yield* rpcRequest<string>("daemon.get_version")
      return yield* rpcRequest<string>("daemon.info")
    })

  const getTorrents = () => {
    const category = config.category?.trim()
    const filter = category ? { label: category } : {}
    return rpcRequest<DelugeUpdateUiResult>("web.update_ui", [REQUIRED_PROPERTIES, filter]).pipe(
      Effect.map(torrentsFrom),
    )
  }

  const ensureLabel = (category: string): Effect.Effect<void, DownloadClientError> =>
    Effect.gen(function* () {
      const methods = yield* getMethods()
      if (!methods.some((method) => method.startsWith("label."))) {
        return yield* makeError(
          config,
          "category_create_failed",
          "Deluge label plugin is not enabled",
          false,
        )
      }

      let labels = yield* rpcRequest<ReadonlyArray<string>>("label.get_labels")
      if (labels.includes(category)) return

      yield* rpcRequest<unknown>("label.add", [category])
      labels = yield* rpcRequest<ReadonlyArray<string>>("label.get_labels")
      if (!labels.includes(category)) {
        return yield* makeError(
          config,
          "category_create_failed",
          `Deluge failed to create label "${category}"`,
          false,
        )
      }
    })

  const fetchTorrent = (downloadUrl: string): Effect.Effect<Buffer, DownloadClientError> =>
    Effect.tryPromise({
      try: async () => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15_000)
        try {
          const response = await fetch(downloadUrl, { signal: controller.signal })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return Buffer.from(await response.arrayBuffer())
        } finally {
          clearTimeout(timeout)
        }
      },
      catch: (error) => {
        if (error instanceof Error && error.name === "AbortError") {
          return makeError(config, "timeout", "torrent fetch timed out after 15s", true)
        }
        return makeError(
          config,
          "download_rejected",
          `failed to fetch torrent: ${error instanceof Error ? error.message : "request failed"}`,
          true,
        )
      },
    })

  return {
    testConnection: () =>
      Effect.gen(function* () {
        const version = yield* getVersion()
        const category = config.category?.trim()
        if (category) yield* ensureLabel(category)
        yield* getTorrents()

        return {
          connected: true,
          version,
          freeSpaceBytes: null,
          errorMessage: null,
        }
      }),

    addDownload: (downloadUrl, options) =>
      Effect.gen(function* () {
        const category = options?.category ?? config.category
        if (category) yield* ensureLabel(category)

        const hash = downloadUrl.startsWith("magnet:")
          ? yield* rpcRequest<string>("core.add_torrent_magnet", [
              downloadUrl,
              addOptions(options?.savePath),
            ])
          : yield* Effect.gen(function* () {
              const torrent = yield* fetchTorrent(downloadUrl)
              return yield* rpcRequest<string>("core.add_torrent_file", [
                filenameFromUrl(downloadUrl),
                torrent.toString("base64"),
                addOptions(options?.savePath),
              ])
            })

        if (typeof hash !== "string" || hash.trim().length === 0) {
          return yield* makeError(config, "download_rejected", "Deluge rejected the torrent", false)
        }

        if (category) yield* rpcRequest<unknown>("label.set_torrent", [hash, category])
        return hash.toUpperCase()
      }),

    getQueue: () =>
      Effect.gen(function* () {
        const torrents = yield* getTorrents()
        return torrents.flatMap((torrent): ReadonlyArray<DownloadStatus> => {
          const hash = stringField(torrent, "hash", "Hash")
          const title = stringField(torrent, "name", "Name")
          if (!hash || !title) return []

          const status = mapStatus(torrent)
          const size = numberField(torrent, "total_size", "Size")

          return [
            {
              externalId: hash.toUpperCase(),
              title,
              status,
              sizeBytes: size,
              progressFraction: normalizedProgress(torrent),
              etaSeconds:
                status === "completed" ? null : numberField(torrent, "eta", "Eta") || null,
              errorMessage:
                status === "failed" ? stringField(torrent, "message", "Message") || null : null,
              outputPath: outputPath(torrent),
              downloadClientId: config.id,
            },
          ]
        })
      }),

    removeDownload: (externalId, deleteFiles) =>
      Effect.gen(function* () {
        const ok = yield* rpcRequest<boolean>("core.remove_torrent", [
          externalId.toLowerCase(),
          deleteFiles,
        ])
        if (!ok) {
          return yield* makeError(
            config,
            "invalid_response",
            "Deluge refused torrent removal",
            false,
          )
        }
      }),

    getHealth: () =>
      Effect.gen(function* () {
        const version = yield* getVersion().pipe(
          Effect.catchAll(() => Effect.succeed(null as string | null)),
        )

        return {
          connected: version !== null,
          version,
          freeSpaceBytes: null,
          errorMessage: version === null ? "failed to connect" : null,
        }
      }),
  }
}
