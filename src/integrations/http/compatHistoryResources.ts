import type { DomainHistoryEventType } from "#/db/schema"
import type { DomainHistoryRow } from "#/effect/services/OperationalHistoryService"

export interface CompatibleHistoryQualityModel {
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

export interface CompatibleHistoryResource {
  readonly id: number
  readonly movieId: number | null
  readonly episodeId: number | null
  readonly seriesId: number | null
  readonly sourceTitle: string
  readonly languages: ReadonlyArray<unknown>
  readonly quality: CompatibleHistoryQualityModel
  readonly customFormats: ReadonlyArray<unknown>
  readonly customFormatScore: number
  readonly qualityCutoffNotMet: boolean
  readonly date: string
  readonly downloadId: string | null
  readonly eventType: string
  readonly data: Readonly<Record<string, string>>
  readonly movie: null
  readonly episode: null
  readonly series: null
}

export interface CompatibleHistoryPagingResource {
  readonly page: number
  readonly pageSize: number
  readonly sortKey: string
  readonly sortDirection: "ascending" | "descending"
  readonly totalRecords: number
  readonly records: ReadonlyArray<CompatibleHistoryResource>
}

const UNKNOWN_QUALITY: CompatibleHistoryQualityModel = {
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

export function historyResource(row: DomainHistoryRow): CompatibleHistoryResource {
  return {
    id: row.id,
    movieId: row.movieId,
    episodeId: row.episodeId,
    seriesId: row.seriesId,
    sourceTitle: row.releaseTitle ?? row.title,
    languages: [],
    quality: UNKNOWN_QUALITY,
    customFormats: [],
    customFormatScore: 0,
    qualityCutoffNotMet: false,
    date: row.createdAt.toISOString(),
    downloadId: row.downloadExternalId,
    eventType: compatibleHistoryEventType(row),
    data: historyData(row),
    movie: null,
    episode: null,
    series: null,
  }
}

export function historyPagingResource(input: {
  readonly rows: ReadonlyArray<DomainHistoryRow>
  readonly totalRecords: number
  readonly page: number
  readonly pageSize: number
  readonly sortKey?: string
  readonly sortDirection?: "ascending" | "descending"
}): CompatibleHistoryPagingResource {
  return {
    page: input.page,
    pageSize: input.pageSize,
    sortKey: input.sortKey ?? "date",
    sortDirection: input.sortDirection ?? "descending",
    totalRecords: input.totalRecords,
    records: input.rows.map(historyResource),
  }
}

export function compatibleHistoryEventType(row: DomainHistoryRow): string {
  switch (row.eventType) {
    case "grabbed":
      return "grabbed"
    case "download_failed":
    case "import_failed":
      return "downloadFailed"
    case "imported":
      return "downloadFolderImported"
    case "deleted":
      return row.mediaKind === "movie" ? "movieFileDeleted" : "episodeFileDeleted"
    case "renamed":
      return row.mediaKind === "movie" ? "movieFileRenamed" : "episodeFileRenamed"
    case "blocklisted":
      return "downloadIgnored"
    default:
      return "unknown"
  }
}

export function localHistoryEventTypes(
  value: string,
): ReadonlyArray<DomainHistoryEventType> | null {
  switch (value) {
    case "1":
    case "grabbed":
      return ["grabbed"]
    case "2":
    case "3":
    case "downloadFolderImported":
    case "movieFolderImported":
    case "seriesFolderImported":
      return ["imported"]
    case "4":
    case "downloadFailed":
      return ["download_failed", "import_failed"]
    case "5":
    case "episodeFileDeleted":
    case "movieFileDeleted":
      return ["deleted"]
    case "6":
      return ["deleted", "renamed"]
    case "8":
    case "episodeFileRenamed":
    case "movieFileRenamed":
      return ["renamed"]
    case "7":
      return ["imported", "blocklisted"]
    case "9":
    case "downloadIgnored":
      return ["blocklisted"]
    case "unknown":
      return [
        "metadata_refreshed",
        "indexer_health_changed",
        "download_client_health_changed",
        "notification_delivery",
        "settings_changed",
      ]
    default:
      return null
  }
}

function historyData(row: DomainHistoryRow): Readonly<Record<string, string>> {
  const data: Record<string, string> = {
    message: row.message,
    mediaKind: row.mediaKind ?? "",
  }

  if (row.indexerName) data.indexer = row.indexerName
  if (row.downloadClientName) data.downloadClient = row.downloadClientName
  if (row.releaseTitle) data.releaseTitle = row.releaseTitle

  for (const [key, value] of Object.entries(row.metadata)) {
    data[key] = sensitiveKey(key) ? "[redacted]" : stringifyHistoryValue(value)
  }

  return data
}

function sensitiveKey(key: string): boolean {
  const normalized = key.toLocaleLowerCase("en-US")
  return (
    normalized.includes("apikey") ||
    normalized.includes("api_key") ||
    normalized.includes("authorization") ||
    normalized.includes("cookie") ||
    normalized.includes("password") ||
    normalized.includes("secret") ||
    normalized.includes("token")
  )
}

function stringifyHistoryValue(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return JSON.stringify(value)
}
