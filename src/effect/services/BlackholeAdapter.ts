import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { access, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { Effect } from "effect"

import type {
  AdapterMetadata,
  DownloadClientConfig,
  DownloadStatus,
  NormalizedDownloadStatus,
} from "../domain/downloadClient"
import { DownloadClientError, type DownloadClientErrorReason } from "../errors"
import type { DownloadClientAdapter } from "./DownloadClientAdapter"

const MEDIA_EXTENSIONS = new Set([
  ".avi",
  ".m2ts",
  ".m4v",
  ".mkv",
  ".mov",
  ".mp4",
  ".mpeg",
  ".mpg",
  ".ts",
  ".webm",
  ".wmv",
])
const INVALID_FILENAME_CHARS = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*"])

type BlackholeKind = "torrent" | "usenet"

export const torrentBlackholeMetadata: AdapterMetadata = {
  displayName: "Torrent Blackhole",
  protocolAffinity: "torrent",
  defaultPort: 1,
  authModel: "local folders",
}

export const usenetBlackholeMetadata: AdapterMetadata = {
  displayName: "Usenet Blackhole",
  protocolAffinity: "usenet",
  defaultPort: 1,
  authModel: "local folders",
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

function sha(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex")
}

function cleanFileName(value: string): string {
  const cleaned = Array.from(value)
    .map((char) => (char.charCodeAt(0) < 32 || INVALID_FILENAME_CHARS.has(char) ? "_" : char))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
  return cleaned.length > 0 ? cleaned.slice(0, 180) : "download"
}

function externalId(kind: BlackholeKind, title: string): string {
  return `blackhole:${kind}:${sha(title.toLowerCase()).slice(0, 32)}`
}

function normalizeExtension(value: string | undefined, fallback: string): string {
  const ext = value?.trim().replace(/^\.+/, "")
  return ext && ext.length > 0 ? `.${ext}` : fallback
}

function stripKnownExtension(filename: string, extension: string): string {
  return filename.toLowerCase().endsWith(extension)
    ? filename.slice(0, -extension.length)
    : path.parse(filename).name
}

function titleFromMagnet(url: string): string {
  const params = new URLSearchParams(url.slice("magnet:?".length))
  const displayName = params.get("dn")
  if (displayName) return cleanFileName(displayName)

  const topic = params.get("xt")
  const hash = topic?.split(":").pop()
  return cleanFileName(hash ? `magnet-${hash}` : `magnet-${sha(url).slice(0, 16)}`)
}

function titleFromUrl(url: string, extension: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === "magnet:") return titleFromMagnet(url)

    const basename = decodeURIComponent(path.basename(parsed.pathname))
    if (basename.length > 0 && basename !== "/" && basename !== ".") {
      return cleanFileName(stripKnownExtension(basename, extension))
    }
  } catch {
    const basename = path.basename(url)
    if (basename.length > 0 && basename !== "." && basename !== "/") {
      return cleanFileName(stripKnownExtension(basename, extension))
    }
  }

  return cleanFileName(`download-${sha(url).slice(0, 16)}`)
}

function titleFromWatchPath(watchPath: string): string {
  return cleanFileName(path.parse(watchPath).name)
}

function configuredFolder(
  config: DownloadClientConfig,
  key: "blackholeFolder" | "watchFolder",
): string {
  const folder = config.settings[key]?.trim()
  if (folder) return folder

  const hostFallback = config.host.trim()
  return hostFallback.length > 0 ? hostFallback : "/downloads"
}

async function ensureDirectory(folder: string): Promise<void> {
  await mkdir(folder, { recursive: true })
  await access(folder, constants.R_OK | constants.W_OK | constants.X_OK)
}

async function readDownloadPayload(url: string): Promise<Buffer> {
  const parsed = new URL(url)
  if (parsed.protocol === "file:") {
    return readFile(fileURLToPath(parsed))
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return Buffer.from(await response.arrayBuffer())
}

async function totalSize(targetPath: string): Promise<number> {
  const stats = await stat(targetPath)
  if (!stats.isDirectory()) return stats.size

  const entries = await readdir(targetPath, { withFileTypes: true })
  const sizes = await Promise.all(
    entries.map((entry) => totalSize(path.join(targetPath, entry.name))),
  )
  return sizes.reduce((sum, size) => sum + size, 0)
}

async function findExternalIdPath(
  kind: BlackholeKind,
  id: string,
  folders: ReadonlyArray<string>,
): Promise<string | null> {
  const folderEntries = await Promise.all(
    folders.map(async (folder) => ({
      folder,
      entries: await readdir(folder, { withFileTypes: true }).catch(() => []),
    })),
  )

  for (const { folder, entries } of folderEntries) {
    for (const entry of entries) {
      const candidate = path.join(folder, entry.name)
      const title = titleFromWatchPath(candidate)
      if (externalId(kind, title) === id) return candidate
    }
  }

  return null
}

function mapWatchStatus(
  statsMtimeMs: number,
  graceSeconds: number,
): {
  readonly status: NormalizedDownloadStatus
  readonly etaSeconds: number | null
  readonly progressFraction: number
} {
  const ageSeconds = Math.max(0, Math.floor((Date.now() - statsMtimeMs) / 1000))
  if (ageSeconds >= graceSeconds) {
    return { status: "completed", etaSeconds: null, progressFraction: 1 }
  }

  return {
    status: "downloading",
    etaSeconds: graceSeconds - ageSeconds,
    progressFraction: 0,
  }
}

function createBlackholeAdapter(
  config: DownloadClientConfig,
  kind: BlackholeKind,
): DownloadClientAdapter {
  const extension = kind === "torrent" ? ".torrent" : ".nzb"
  const blackholeFolder = configuredFolder(config, "blackholeFolder")
  const watchFolder = configuredFolder(config, "watchFolder")
  const graceSeconds = Math.max(0, config.settings.watchGracePeriodSeconds ?? 30)

  const testFolders = (): Effect.Effect<void, DownloadClientError> =>
    Effect.tryPromise({
      try: async () => {
        await ensureDirectory(blackholeFolder)
        await ensureDirectory(watchFolder)
      },
      catch: (error) =>
        makeError(
          config,
          "connection_refused",
          error instanceof Error ? error.message : "folder validation failed",
          true,
        ),
    })

  return {
    testConnection: () =>
      testFolders().pipe(
        Effect.as({
          connected: true,
          version: "folder",
          freeSpaceBytes: null,
          errorMessage: null,
        }),
      ),

    addDownload: (url) =>
      Effect.tryPromise({
        try: async () => {
          await ensureDirectory(blackholeFolder)

          const title = titleFromUrl(url, extension)
          const id = externalId(kind, title)
          const targetPath =
            url.startsWith("magnet:") && kind === "torrent"
              ? path.join(
                  blackholeFolder,
                  `${title}${normalizeExtension(config.settings.magnetFileExtension, ".magnet")}`,
                )
              : path.join(blackholeFolder, `${title}${extension}`)

          if (url.startsWith("magnet:")) {
            if (kind !== "torrent") {
              throw Object.assign(new Error("usenet blackhole does not support magnet links"), {
                rejected: true,
              })
            }
            if (!config.settings.saveMagnetFiles) {
              throw Object.assign(
                new Error("torrent blackhole is not configured to save magnets"),
                {
                  rejected: true,
                },
              )
            }
            await writeFile(targetPath, url, "utf8")
            return id
          }

          const payload = await readDownloadPayload(url)
          await writeFile(targetPath, payload)
          return id
        },
        catch: (error) => {
          const rejected = (error as Record<string, unknown>).rejected === true
          return makeError(
            config,
            rejected ? "download_rejected" : "connection_refused",
            error instanceof Error ? error.message : "blackhole add failed",
            !rejected,
          )
        },
      }),

    getQueue: () =>
      Effect.tryPromise({
        try: async () => {
          await ensureDirectory(watchFolder)
          const entries = await readdir(watchFolder, { withFileTypes: true })

          const statuses = await Promise.all(
            entries.map(async (entry): Promise<DownloadStatus | null> => {
              if (entry.name.startsWith(".")) return null

              const outputPath = path.join(watchFolder, entry.name)
              const entryStats = await stat(outputPath)
              const isImportableFile =
                entry.isFile() && MEDIA_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
              if (!entry.isDirectory() && !isImportableFile) return null

              const title = titleFromWatchPath(outputPath)
              const status = mapWatchStatus(entryStats.mtimeMs, graceSeconds)

              return {
                externalId: externalId(kind, title),
                title,
                status: status.status,
                sizeBytes: await totalSize(outputPath),
                progressFraction: status.progressFraction,
                etaSeconds: status.etaSeconds,
                errorMessage: null,
                outputPath,
                downloadClientId: config.id,
              }
            }),
          )

          return statuses.filter((status): status is DownloadStatus => status !== null)
        },
        catch: (error) =>
          makeError(
            config,
            "connection_refused",
            error instanceof Error ? error.message : "watch folder scan failed",
            true,
          ),
      }),

    removeDownload: (id, deleteFiles) =>
      Effect.tryPromise({
        try: async () => {
          if (!deleteFiles) {
            throw Object.assign(
              new Error("blackhole removals require deleting the watched/submitted files"),
              { rejected: true },
            )
          }

          const targetPath = await findExternalIdPath(kind, id, [watchFolder, blackholeFolder])
          if (targetPath) await rm(targetPath, { recursive: true, force: true })
        },
        catch: (error) => {
          const rejected = (error as Record<string, unknown>).rejected === true
          return makeError(
            config,
            rejected ? "download_rejected" : "connection_refused",
            error instanceof Error ? error.message : "blackhole remove failed",
            !rejected,
          )
        },
      }),

    getHealth: () =>
      testFolders().pipe(
        Effect.as({
          connected: true,
          version: "folder",
          freeSpaceBytes: null,
          errorMessage: null,
        }),
      ),
  }
}

export function createTorrentBlackholeAdapter(config: DownloadClientConfig): DownloadClientAdapter {
  return createBlackholeAdapter(config, "torrent")
}

export function createUsenetBlackholeAdapter(config: DownloadClientConfig): DownloadClientAdapter {
  return createBlackholeAdapter(config, "usenet")
}
