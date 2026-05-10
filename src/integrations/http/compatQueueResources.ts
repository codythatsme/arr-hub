import type { QueueItem } from "#/effect/services/QueueService"

export interface CompatibleQueueQualityModel {
  readonly quality: {
    readonly id: number
    readonly name: string
    readonly source: string
    readonly resolution: number
    readonly modifier: string
  }
  readonly revision: {
    readonly version: number
    readonly real: number
    readonly isRepack: boolean
  }
}

export interface CompatibleQueueStatusMessage {
  readonly title: string
  readonly messages: ReadonlyArray<string>
}

export interface CompatibleQueueResource {
  readonly id: number
  readonly movieId: number | null
  readonly movie: null
  readonly seriesId: number | null
  readonly episodeId: number | null
  readonly seasonNumber: number | null
  readonly series: null
  readonly episode: null
  readonly languages: ReadonlyArray<unknown>
  readonly quality: CompatibleQueueQualityModel
  readonly customFormats: ReadonlyArray<unknown>
  readonly customFormatScore: number
  readonly size: number
  readonly title: string
  readonly estimatedCompletionTime: string | null
  readonly added: string
  readonly status: string
  readonly trackedDownloadStatus: string
  readonly trackedDownloadState: string
  readonly statusMessages: ReadonlyArray<CompatibleQueueStatusMessage>
  readonly errorMessage: string | null
  readonly downloadId: string
  readonly protocol: string
  readonly downloadClient: string
  readonly downloadClientHasPostImportCategory: boolean
  readonly indexer: string | null
  readonly outputPath: string | null
  readonly episodeHasFile: boolean
  readonly sizeleft: number
  readonly timeleft: string | null
}

export interface CompatibleQueuePagingResource {
  readonly page: number
  readonly pageSize: number
  readonly sortKey: string
  readonly sortDirection: "ascending" | "descending"
  readonly totalRecords: number
  readonly records: ReadonlyArray<CompatibleQueueResource>
}

export interface CompatibleQueueStatusResource {
  readonly id: number
  readonly totalCount: number
  readonly count: number
  readonly unknownCount: number
  readonly errors: boolean
  readonly warnings: boolean
  readonly unknownErrors: boolean
  readonly unknownWarnings: boolean
}

export interface QueuePagingOptions {
  readonly page?: number
  readonly pageSize?: number
  readonly sortKey?: string
  readonly sortDirection?: "ascending" | "descending"
}

const UNKNOWN_QUALITY: CompatibleQueueQualityModel = {
  quality: {
    id: 0,
    name: "Unknown",
    source: "unknown",
    resolution: 0,
    modifier: "none",
  },
  revision: {
    version: 1,
    real: 0,
    isRepack: false,
  },
}

export function queueResource(item: QueueItem): CompatibleQueueResource {
  const episodeId = item.media.type === "series" ? (item.media.episodeIds?.[0] ?? null) : null
  const etaSeconds = item.etaSeconds ?? null

  return {
    id: item.id,
    movieId: item.media.type === "movie" ? item.media.id : null,
    movie: null,
    seriesId: item.media.type === "series" ? item.media.id : null,
    episodeId,
    seasonNumber: null,
    series: null,
    episode: null,
    languages: [],
    quality: UNKNOWN_QUALITY,
    customFormats: [],
    customFormatScore: 0,
    size: item.sizeBytes,
    title: item.title,
    estimatedCompletionTime:
      etaSeconds === null
        ? null
        : new Date(item.updatedAt.getTime() + etaSeconds * 1000).toISOString(),
    added: item.addedAt.toISOString(),
    status: compatibleQueueStatus(item.status),
    trackedDownloadStatus: trackedDownloadStatus(item),
    trackedDownloadState: trackedDownloadState(item.status),
    statusMessages: item.errorMessage
      ? [{ title: "Download failed", messages: [item.errorMessage] }]
      : [],
    errorMessage: item.errorMessage,
    downloadId: item.externalId,
    protocol: protocolForDownloadClientType(item.downloadClient.type),
    downloadClient: item.downloadClient.name,
    downloadClientHasPostImportCategory: false,
    indexer: null,
    outputPath: item.outputPath,
    episodeHasFile: false,
    sizeleft: sizeLeft(item),
    timeleft: etaSeconds === null ? null : timeSpan(etaSeconds),
  }
}

export function queuePagingResource(
  items: ReadonlyArray<QueueItem>,
  options: QueuePagingOptions = {},
): CompatibleQueuePagingResource {
  const page = positiveInteger(options.page, 1)
  const pageSize = positiveInteger(options.pageSize, 20)
  const sortKey = options.sortKey ?? "timeleft"
  const sortDirection = options.sortDirection ?? "ascending"
  const sorted = items.toSorted(queueComparator(sortKey, sortDirection))
  const start = (page - 1) * pageSize

  return {
    page,
    pageSize,
    sortKey,
    sortDirection,
    totalRecords: sorted.length,
    records: sorted.slice(start, start + pageSize).map(queueResource),
  }
}

export function queueStatusResource(
  items: ReadonlyArray<QueueItem>,
): CompatibleQueueStatusResource {
  const linked = items.filter((item) => item.media.type !== "unlinked")
  const unknown = items.filter((item) => item.media.type === "unlinked")

  return {
    id: 0,
    totalCount: items.length,
    count: linked.length,
    unknownCount: unknown.length,
    errors: linked.some(isErrored),
    warnings: linked.some(isWarning),
    unknownErrors: unknown.some(isErrored),
    unknownWarnings: unknown.some(isWarning),
  }
}

export function compatibleQueueStatus(status: string): string {
  switch (status) {
    case "queued":
      return "queued"
    case "downloading":
      return "downloading"
    case "completed":
      return "completed"
    case "failed":
      return "failed"
    case "importing":
      return "completed"
    default:
      return "unknown"
  }
}

export function protocolForDownloadClientType(type: string): string {
  switch (type) {
    case "deluge":
    case "qbittorrent":
    case "torrent_blackhole":
    case "transmission":
      return "torrent"
    case "nzbget":
    case "sabnzbd":
    case "usenet_blackhole":
      return "usenet"
    default:
      return "unknown"
  }
}

function trackedDownloadStatus(item: QueueItem): string {
  if (item.status === "failed" || item.errorMessage) return "error"
  if (item.status === "importing") return "warning"
  return "ok"
}

function trackedDownloadState(status: string): string {
  switch (status) {
    case "completed":
      return "importPending"
    case "failed":
      return "failed"
    case "importing":
      return "importing"
    case "queued":
    case "downloading":
    default:
      return "downloading"
  }
}

function sizeLeft(item: QueueItem): number {
  if (item.sizeBytes <= 0) return 0
  const progress = Math.max(0, Math.min(1, item.progress))
  return Math.round(item.sizeBytes * (1 - progress))
}

function timeSpan(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remainingSeconds = total % 60
  return `${hours}:${pad(minutes)}:${pad(remainingSeconds)}`
}

function pad(value: number): string {
  return value.toString().padStart(2, "0")
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isInteger(value) || value < 1) return fallback
  return value
}

function queueComparator(
  sortKey: string,
  direction: "ascending" | "descending",
): (left: QueueItem, right: QueueItem) => number {
  const multiplier = direction === "ascending" ? 1 : -1
  return (left, right) => compareQueueValue(left, right, sortKey) * multiplier
}

function compareQueueValue(left: QueueItem, right: QueueItem, sortKey: string): number {
  switch (sortKey.toLocaleLowerCase("en-US")) {
    case "added":
      return left.addedAt.getTime() - right.addedAt.getTime()
    case "downloadclient":
      return left.downloadClient.name.localeCompare(right.downloadClient.name)
    case "estimatedcompletiontime":
    case "timeleft":
      return nullableNumber(left.etaSeconds) - nullableNumber(right.etaSeconds)
    case "progress":
      return left.progress - right.progress
    case "size":
      return left.sizeBytes - right.sizeBytes
    case "status":
      return compatibleQueueStatus(left.status).localeCompare(compatibleQueueStatus(right.status))
    case "title":
      return left.title.localeCompare(right.title)
    default:
      return left.updatedAt.getTime() - right.updatedAt.getTime()
  }
}

function nullableNumber(value: number | null): number {
  return value ?? Number.MAX_SAFE_INTEGER
}

function isErrored(item: QueueItem): boolean {
  return item.status === "failed" || item.errorMessage !== null
}

function isWarning(item: QueueItem): boolean {
  return item.status === "importing"
}
