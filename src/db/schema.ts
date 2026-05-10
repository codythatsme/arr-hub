import { sql } from "drizzle-orm"
import { integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"

import type { DownloadClientSettings } from "#/effect/domain/downloadClient"
import type {
  IndexerAuthField,
  IndexerCategoryMapping,
  IndexerCapabilities,
  IndexerConfigValues,
  IndexerDefinitionImplementation,
  IndexerPrivacy,
  IndexerProtocol,
  IndexerProxySettings,
  IndexerProxyType,
} from "#/effect/domain/indexer"
import type {
  IndexerApplicationSettings,
  IndexerApplicationType,
} from "#/effect/domain/indexerApplication"
import type { MediaServerSettings } from "#/effect/domain/mediaServer"
import type { DecisionReason, MediaType, ReleaseDecision } from "#/effect/domain/release"
import type {
  SchedulerJobPayload,
  SchedulerJobStatus,
  SchedulerJobType,
} from "#/effect/domain/scheduler"

export const systemLogLevels = ["debug", "info", "warn", "error"] as const
export type SystemLogLevel = (typeof systemLogLevels)[number]

export const domainHistoryEventTypes = [
  "grabbed",
  "download_failed",
  "imported",
  "import_failed",
  "renamed",
  "deleted",
  "blocklisted",
  "metadata_refreshed",
  "indexer_health_changed",
  "download_client_health_changed",
  "notification_delivery",
  "settings_changed",
] as const
export type DomainHistoryEventType = (typeof domainHistoryEventTypes)[number]

export const domainHistoryMediaKinds = ["movie", "series", "season", "episode"] as const
export type DomainHistoryMediaKind = (typeof domainHistoryMediaKinds)[number]

export const downloadHistoryStatuses = ["completed", "failed", "removed"] as const
export type DownloadHistoryStatus = (typeof downloadHistoryStatuses)[number]

export const downloadHistoryMediaKinds = ["movie", "series"] as const
export type DownloadHistoryMediaKind = (typeof downloadHistoryMediaKinds)[number]

export const users = sqliteTable("users", {
  id: integer().primaryKey({ autoIncrement: true }),
  username: text().notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const apiKeys = sqliteTable("api_keys", {
  id: integer().primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  kind: text({ enum: ["session", "api_key"] }).notNull(),
  name: text().notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const qualityProfiles = sqliteTable("quality_profiles", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull().unique(),
  upgradeAllowed: integer("upgrade_allowed", { mode: "boolean" }).notNull().default(false),
  minFormatScore: integer("min_format_score").notNull().default(0),
  cutoffFormatScore: integer("cutoff_format_score").notNull().default(0),
  minUpgradeFormatScore: integer("min_upgrade_format_score").notNull().default(1),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  appliedBundleId: text("applied_bundle_id"),
  appliedBundleVersion: integer("applied_bundle_version"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const qualityItems = sqliteTable("quality_items", {
  id: integer().primaryKey({ autoIncrement: true }),
  profileId: integer("profile_id")
    .notNull()
    .references(() => qualityProfiles.id, { onDelete: "cascade" }),
  qualityName: text("quality_name"),
  groupName: text("group_name"),
  weight: integer().notNull(),
  allowed: integer({ mode: "boolean" }).notNull().default(true),
})

export const customFormats = sqliteTable("custom_formats", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull().unique(),
  includeWhenRenaming: integer("include_when_renaming", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const customFormatSpecs = sqliteTable("custom_format_specs", {
  id: integer().primaryKey({ autoIncrement: true }),
  customFormatId: integer("custom_format_id")
    .notNull()
    .references(() => customFormats.id, { onDelete: "cascade" }),
  name: text().notNull(),
  field: text({
    enum: ["releaseTitle", "releaseGroup", "edition", "source", "resolution", "qualityModifier"],
  }).notNull(),
  pattern: text().notNull(),
  negate: integer({ mode: "boolean" }).notNull().default(false),
  required: integer({ mode: "boolean" }).notNull().default(false),
})

export const customFormatScores = sqliteTable(
  "custom_format_scores",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => qualityProfiles.id, { onDelete: "cascade" }),
    customFormatId: integer("custom_format_id")
      .notNull()
      .references(() => customFormats.id, { onDelete: "cascade" }),
    score: integer().notNull().default(0),
  },
  (t) => [unique().on(t.profileId, t.customFormatId)],
)

export const movies = sqliteTable("movies", {
  id: integer().primaryKey({ autoIncrement: true }),
  tmdbId: integer("tmdb_id").notNull().unique(),
  imdbId: text("imdb_id"),
  title: text().notNull(),
  originalTitle: text("original_title"),
  year: integer(),
  releaseDate: integer("release_date", { mode: "timestamp" }),
  overview: text(),
  posterPath: text("poster_path"),
  genres: text({ mode: "json" })
    .$type<ReadonlyArray<string>>()
    .notNull()
    .default(sql`'[]'`),
  runtimeMinutes: integer("runtime_minutes"),
  status: text({ enum: ["wanted", "available", "missing"] })
    .notNull()
    .default("wanted"),
  qualityProfileId: integer("quality_profile_id").references(() => qualityProfiles.id),
  rootFolderPath: text("root_folder_path"),
  monitored: integer({ mode: "boolean" }).notNull().default(true),
  hasFile: integer("has_file", { mode: "boolean" }).notNull().default(false),
  filePath: text("file_path"),
  existingQualityName: text("existing_quality_name"),
  existingQualityRank: integer("existing_quality_rank"),
  existingFormatScore: integer("existing_format_score"),
  metadataRefreshedAt: integer("metadata_refreshed_at", { mode: "timestamp" }),
  addedAt: integer("added_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const series = sqliteTable("series", {
  id: integer().primaryKey({ autoIncrement: true }),
  tvdbId: integer("tvdb_id").notNull().unique(),
  tmdbId: integer("tmdb_id").unique(),
  imdbId: text("imdb_id"),
  title: text().notNull(),
  originalTitle: text("original_title"),
  year: integer(),
  overview: text(),
  posterPath: text("poster_path"),
  status: text({ enum: ["continuing", "ended", "wanted", "available"] })
    .notNull()
    .default("wanted"),
  network: text(),
  genres: text({ mode: "json" })
    .$type<ReadonlyArray<string>>()
    .notNull()
    .default(sql`'[]'`),
  runtimeMinutes: integer("runtime_minutes"),
  seriesType: text("series_type"),
  certification: text(),
  rootFolderPath: text("root_folder_path"),
  monitored: integer({ mode: "boolean" }).notNull().default(true),
  qualityProfileId: integer("quality_profile_id").references(() => qualityProfiles.id),
  seasonFolder: integer("season_folder", { mode: "boolean" }).notNull().default(true),
  metadataRefreshedAt: integer("metadata_refreshed_at", { mode: "timestamp" }),
  addedAt: integer("added_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const seasons = sqliteTable(
  "seasons",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    seriesId: integer("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    tmdbId: integer("tmdb_id").unique(),
    seasonNumber: integer("season_number").notNull(),
    monitored: integer({ mode: "boolean" }).notNull().default(true),
  },
  (t) => [unique().on(t.seriesId, t.seasonNumber)],
)

export const episodes = sqliteTable(
  "episodes",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    tvdbId: integer("tvdb_id").notNull().unique(),
    tmdbId: integer("tmdb_id").unique(),
    title: text().notNull(),
    episodeNumber: integer("episode_number").notNull(),
    absoluteEpisodeNumber: integer("absolute_episode_number"),
    airDate: integer("air_date", { mode: "timestamp" }),
    overview: text(),
    runtimeMinutes: integer("runtime_minutes"),
    hasFile: integer("has_file", { mode: "boolean" }).notNull().default(false),
    filePath: text("file_path"),
    monitored: integer({ mode: "boolean" }).notNull().default(true),
    existingQualityName: text("existing_quality_name"),
    existingQualityRank: integer("existing_quality_rank"),
    existingFormatScore: integer("existing_format_score"),
  },
  (t) => [unique().on(t.seasonId, t.episodeNumber)],
)

export const settings = sqliteTable("settings", {
  key: text().primaryKey(),
  value: text().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const rootFolders = sqliteTable("root_folders", {
  id: integer().primaryKey({ autoIncrement: true }),
  path: text().notNull().unique(),
  freeSpaceBytes: integer("free_space_bytes"),
  totalSpaceBytes: integer("total_space_bytes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const indexerProxies = sqliteTable("indexer_proxies", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  type: text().$type<IndexerProxyType>().notNull(),
  host: text().notNull(),
  port: integer(),
  username: text(),
  passwordEncrypted: text("password_encrypted"),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
  settings: text({ mode: "json" })
    .$type<IndexerProxySettings>()
    .notNull()
    .default(sql`'{}'`),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const indexers = sqliteTable("indexers", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  type: text().notNull(),
  definitionKey: text("definition_key"),
  baseUrl: text("base_url").notNull(),
  apiKeyEncrypted: text("api_key_encrypted").notNull(),
  configValuesEncrypted: text("config_values_encrypted", { mode: "json" })
    .$type<IndexerConfigValues>()
    .notNull()
    .default(sql`'{}'`),
  proxyId: integer("proxy_id").references(() => indexerProxies.id, { onDelete: "set null" }),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
  searchEnabled: integer("search_enabled", { mode: "boolean" }).notNull().default(true),
  rssEnabled: integer("rss_enabled", { mode: "boolean" }).notNull().default(true),
  priority: integer().notNull().default(50),
  minimumSeeders: integer("minimum_seeders"),
  queryCooldownSeconds: integer("query_cooldown_seconds"),
  queryLimitCount: integer("query_limit_count"),
  queryLimitWindowSeconds: integer("query_limit_window_seconds"),
  grabLimitCount: integer("grab_limit_count"),
  grabLimitWindowSeconds: integer("grab_limit_window_seconds"),
  categories: text({ mode: "json" })
    .$type<ReadonlyArray<number>>()
    .notNull()
    .default(sql`'[]'`),
  tags: text({ mode: "json" })
    .$type<ReadonlyArray<string>>()
    .notNull()
    .default(sql`'[]'`),
  capabilities: text({ mode: "json" })
    .$type<IndexerCapabilities | null>()
    .default(sql`'null'`),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const indexerDefinitions = sqliteTable("indexer_definitions", {
  id: integer().primaryKey({ autoIncrement: true }),
  definitionKey: text("definition_key").notNull().unique(),
  displayName: text("display_name").notNull(),
  protocol: text().$type<IndexerProtocol>().notNull(),
  implementation: text().$type<IndexerDefinitionImplementation>().notNull(),
  baseUrl: text("base_url"),
  privacy: text().$type<IndexerPrivacy>().notNull().default("private"),
  supportsRss: integer("supports_rss", { mode: "boolean" }).notNull().default(true),
  supportsSearch: integer("supports_search", { mode: "boolean" }).notNull().default(true),
  authFields: text("auth_fields", { mode: "json" })
    .$type<ReadonlyArray<IndexerAuthField>>()
    .notNull()
    .default(sql`'[]'`),
  categories: text({ mode: "json" })
    .$type<ReadonlyArray<IndexerCategoryMapping>>()
    .notNull()
    .default(sql`'[]'`),
  capabilities: text({ mode: "json" })
    .$type<IndexerCapabilities>()
    .notNull()
    .default(sql`'{"searchTypes":[],"categories":[]}'`),
  tags: text({ mode: "json" })
    .$type<ReadonlyArray<string>>()
    .notNull()
    .default(sql`'[]'`),
  version: text().notNull().default("builtin-1"),
  sourceYaml: text("source_yaml"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const indexerDefinitionSources = sqliteTable("indexer_definition_sources", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  url: text().notNull().unique(),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
  pinnedSha256: text("pinned_sha256"),
  lastCheckedAt: integer("last_checked_at", { mode: "timestamp" }),
  lastError: text("last_error"),
  lastDefinitionKey: text("last_definition_key"),
  lastVersion: text("last_version"),
  lastSha256: text("last_sha256"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const indexerStats = sqliteTable("indexer_stats", {
  id: integer().primaryKey({ autoIncrement: true }),
  indexerId: integer("indexer_id")
    .notNull()
    .unique()
    .references(() => indexers.id, { onDelete: "cascade" }),
  totalSearches: integer("total_searches").notNull().default(0),
  successfulSearches: integer("successful_searches").notNull().default(0),
  failedSearches: integer("failed_searches").notNull().default(0),
  totalRss: integer("total_rss").notNull().default(0),
  successfulRss: integer("successful_rss").notNull().default(0),
  failedRss: integer("failed_rss").notNull().default(0),
  totalGrabs: integer("total_grabs").notNull().default(0),
  averageResponseTimeMs: integer("average_response_time_ms"),
  lastSearchAt: integer("last_search_at", { mode: "timestamp" }),
  lastRssAt: integer("last_rss_at", { mode: "timestamp" }),
  lastGrabAt: integer("last_grab_at", { mode: "timestamp" }),
  queryLimitWindowStartedAt: integer("query_limit_window_started_at", { mode: "timestamp" }),
  queryLimitWindowSearches: integer("query_limit_window_searches").notNull().default(0),
  grabLimitWindowStartedAt: integer("grab_limit_window_started_at", { mode: "timestamp" }),
  grabLimitWindowGrabs: integer("grab_limit_window_grabs").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const indexerHealth = sqliteTable("indexer_health", {
  id: integer().primaryKey({ autoIncrement: true }),
  indexerId: integer("indexer_id")
    .notNull()
    .unique()
    .references(() => indexers.id, { onDelete: "cascade" }),
  lastCheck: integer("last_check", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  status: text({ enum: ["healthy", "unhealthy", "unknown"] })
    .notNull()
    .default("unknown"),
  errorMessage: text("error_message"),
  responseTimeMs: integer("response_time_ms"),
})

export const recentReleases = sqliteTable(
  "recent_releases",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    indexerId: integer("indexer_id")
      .notNull()
      .references(() => indexers.id, { onDelete: "cascade" }),
    releaseKey: text("release_key").notNull(),
    title: text().notNull(),
    indexerName: text("indexer_name").notNull(),
    indexerPriority: integer("indexer_priority").notNull(),
    size: integer().notNull(),
    seeders: integer(),
    leechers: integer(),
    age: integer().notNull(),
    downloadUrl: text("download_url").notNull(),
    infoUrl: text("info_url"),
    category: text().notNull(),
    protocol: text().$type<IndexerProtocol>().notNull(),
    publishedAt: integer("published_at", { mode: "timestamp" }).notNull(),
    infohash: text(),
    downloadFactor: real("download_factor").notNull().default(1),
    uploadFactor: real("upload_factor").notNull().default(1),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [unique().on(t.indexerId, t.releaseKey)],
)

export const indexerApplications = sqliteTable("indexer_applications", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  type: text().$type<IndexerApplicationType>().notNull(),
  baseUrl: text("base_url").notNull(),
  apiKeyEncrypted: text("api_key_encrypted").notNull(),
  syncBaseUrl: text("sync_base_url").notNull(),
  syncApiKeyEncrypted: text("sync_api_key_encrypted").notNull(),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
  settings: text({ mode: "json" })
    .$type<IndexerApplicationSettings>()
    .notNull()
    .default(sql`'{"syncCategories":[],"syncLevel":"full"}'`),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
  lastError: text("last_error"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const indexerApplicationMappings = sqliteTable(
  "indexer_application_mappings",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    applicationId: integer("application_id")
      .notNull()
      .references(() => indexerApplications.id, { onDelete: "cascade" }),
    protocol: text().$type<IndexerProtocol>().notNull(),
    remoteIndexerId: integer("remote_indexer_id").notNull(),
    remoteIndexerName: text("remote_indexer_name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [unique().on(t.applicationId, t.protocol)],
)

export const downloadClients = sqliteTable("download_clients", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  type: text().notNull(),
  host: text().notNull(),
  port: integer().notNull(),
  username: text().notNull(),
  passwordEncrypted: text("password_encrypted").notNull(),
  useSsl: integer("use_ssl", { mode: "boolean" }).notNull().default(false),
  category: text(),
  priority: integer().notNull().default(50),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
  settings: text({ mode: "json" })
    .$type<DownloadClientSettings>()
    .notNull()
    .default(sql`'{"pollIntervalMs":5000}'`),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const downloadClientHealth = sqliteTable("download_client_health", {
  id: integer().primaryKey({ autoIncrement: true }),
  downloadClientId: integer("download_client_id")
    .notNull()
    .unique()
    .references(() => downloadClients.id, { onDelete: "cascade" }),
  lastCheck: integer("last_check", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  status: text({ enum: ["healthy", "unhealthy", "unknown"] })
    .notNull()
    .default("unknown"),
  errorMessage: text("error_message"),
  responseTimeMs: integer("response_time_ms"),
})

export const downloadQueue = sqliteTable("download_queue", {
  id: integer().primaryKey({ autoIncrement: true }),
  downloadClientId: integer("download_client_id")
    .notNull()
    .references(() => downloadClients.id, { onDelete: "cascade" }),
  movieId: integer("movie_id").references(() => movies.id, { onDelete: "set null" }),
  seriesId: integer("series_id").references(() => series.id, { onDelete: "set null" }),
  episodeIds: text("episode_ids", { mode: "json" }).$type<ReadonlyArray<number> | null>(),
  externalId: text("external_id").notNull().unique(),
  status: text({ enum: ["queued", "downloading", "importing", "completed", "failed"] })
    .notNull()
    .default("queued"),
  title: text().notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  progress: real().notNull().default(0.0),
  etaSeconds: integer("eta_seconds"),
  errorMessage: text("error_message"),
  outputPath: text("output_path"),
  addedAt: integer("added_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const downloadHistory = sqliteTable("download_history", {
  id: integer().primaryKey({ autoIncrement: true }),
  queueId: integer("queue_id"),
  downloadClientId: integer("download_client_id"),
  downloadClientName: text("download_client_name"),
  mediaKind: text("media_kind").$type<DownloadHistoryMediaKind>(),
  movieId: integer("movie_id"),
  seriesId: integer("series_id"),
  episodeIds: text("episode_ids", { mode: "json" }).$type<ReadonlyArray<number> | null>(),
  mediaTitle: text("media_title"),
  externalId: text("external_id").notNull(),
  title: text().notNull(),
  status: text().$type<DownloadHistoryStatus>().notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  progress: real().notNull().default(0.0),
  errorMessage: text("error_message"),
  outputPath: text("output_path"),
  metadata: text({ mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'`),
  recordedAt: integer("recorded_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const remotePathMappings = sqliteTable(
  "remote_path_mappings",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    downloadClientId: integer("download_client_id").references(() => downloadClients.id, {
      onDelete: "cascade",
    }),
    remotePath: text("remote_path").notNull(),
    localPath: text("local_path").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [unique().on(t.downloadClientId, t.remotePath)],
)

export const mediaFiles = sqliteTable(
  "media_files",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    mediaKind: text("media_kind", { enum: ["movie", "episode"] }).notNull(),
    mediaId: integer("media_id").notNull(),
    path: text().notNull().unique(),
    sourcePath: text("source_path"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    qualityName: text("quality_name"),
    qualityRank: integer("quality_rank"),
    formatScore: integer("format_score").notNull().default(0),
    importedAt: integer("imported_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [unique().on(t.mediaKind, t.mediaId)],
)

// ── Media Servers ──

export const mediaServers = sqliteTable("media_servers", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  type: text().notNull(),
  host: text().notNull(),
  port: integer().notNull(),
  tokenEncrypted: text("token_encrypted").notNull(),
  useSsl: integer("use_ssl", { mode: "boolean" }).notNull().default(false),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
  settings: text({ mode: "json" })
    .$type<MediaServerSettings>()
    .notNull()
    .default(sql`'{"syncIntervalMs":3600000,"monitoringEnabled":true}'`),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const mediaServerHealth = sqliteTable("media_server_health", {
  id: integer().primaryKey({ autoIncrement: true }),
  mediaServerId: integer("media_server_id")
    .notNull()
    .unique()
    .references(() => mediaServers.id, { onDelete: "cascade" }),
  lastCheck: integer("last_check", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  status: text({ enum: ["healthy", "unhealthy", "unknown"] })
    .notNull()
    .default("unknown"),
  errorMessage: text("error_message"),
  responseTimeMs: integer("response_time_ms"),
})

export const mediaServerLibraries = sqliteTable(
  "media_server_libraries",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    mediaServerId: integer("media_server_id")
      .notNull()
      .references(() => mediaServers.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    name: text().notNull(),
    type: text({ enum: ["movie", "show"] }).notNull(),
    enabled: integer({ mode: "boolean" }).notNull().default(true),
    lastSynced: integer("last_synced", { mode: "timestamp" }),
  },
  (t) => [unique().on(t.mediaServerId, t.externalId)],
)

export const plexUsers = sqliteTable(
  "plex_users",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    mediaServerId: integer("media_server_id")
      .notNull()
      .references(() => mediaServers.id, { onDelete: "cascade" }),
    plexUserId: text("plex_user_id").notNull(),
    username: text().notNull(),
    friendlyName: text("friendly_name").notNull(),
    email: text(),
    thumb: text(),
    isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
    totalPlayCount: integer("total_play_count").notNull().default(0),
    totalWatchTimeSec: integer("total_watch_time_sec").notNull().default(0),
    syncedAt: integer("synced_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [unique().on(t.mediaServerId, t.plexUserId)],
)

export const sessionHistory = sqliteTable("session_history", {
  id: integer().primaryKey({ autoIncrement: true }),
  mediaServerId: integer("media_server_id")
    .notNull()
    .references(() => mediaServers.id, { onDelete: "cascade" }),
  plexUserId: text("plex_user_id").notNull(),
  plexUsername: text("plex_username").notNull(),
  ratingKey: text("rating_key").notNull(),
  mediaType: text("media_type", { enum: ["movie", "episode"] }).notNull(),
  title: text().notNull(),
  parentTitle: text("parent_title"),
  grandparentTitle: text("grandparent_title"),
  year: integer(),
  thumb: text(),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  stoppedAt: integer("stopped_at", { mode: "timestamp" }).notNull(),
  duration: integer().notNull(),
  viewOffset: integer("view_offset").notNull(),
  pausedDurationSec: integer("paused_duration_sec").notNull().default(0),
  transcodeDecision: text("transcode_decision", {
    enum: ["direct_play", "direct_stream", "transcode"],
  }).notNull(),
  videoResolution: text("video_resolution"),
  audioCodec: text("audio_codec"),
  player: text().notNull(),
  platform: text().notNull(),
  product: text(),
  ipAddress: text("ip_address"),
  bandwidth: integer(),
  isLocal: integer("is_local", { mode: "boolean" }).notNull(),
  movieId: integer("movie_id").references(() => movies.id, { onDelete: "set null" }),
  episodeId: integer("episode_id").references(() => episodes.id, { onDelete: "set null" }),
})

// ── Notifications ──

export type NotificationEvent =
  | "session_start"
  | "session_stop"
  | "media_watched"
  | "server_down"
  | "server_up"
  | "new_content"

export type NotificationChannelType = "in_app" | "webhook"

export interface NotificationChannelSettings {
  readonly url?: string
  readonly headers?: Record<string, string>
}

export const notificationChannels = sqliteTable("notification_channels", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  type: text("type").$type<NotificationChannelType>().notNull(),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
  events: text({ mode: "json" })
    .$type<ReadonlyArray<NotificationEvent>>()
    .notNull()
    .default(sql`'[]'`),
  settings: text({ mode: "json" })
    .$type<NotificationChannelSettings>()
    .notNull()
    .default(sql`'{}'`),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const notificationDeliveries = sqliteTable("notification_deliveries", {
  id: integer().primaryKey({ autoIncrement: true }),
  channelId: integer("channel_id").references(() => notificationChannels.id, {
    onDelete: "set null",
  }),
  event: text().$type<NotificationEvent>().notNull(),
  title: text().notNull(),
  message: text().notNull(),
  payload: text({ mode: "json" }).$type<Record<string, unknown>>().notNull(),
  status: text({ enum: ["sent", "failed", "skipped"] }).notNull(),
  errorMessage: text("error_message"),
  deliveredAt: integer("delivered_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

// ── Local Plugins ──

export type PluginCapability = "download_client" | "indexer" | "media_server"

export const plugins = sqliteTable("plugins", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull().unique(),
  path: text().notNull(),
  version: text().notNull(),
  enabled: integer({ mode: "boolean" }).notNull().default(false),
  capabilities: text({ mode: "json" }).$type<ReadonlyArray<PluginCapability>>().notNull(),
  loadedAt: integer("loaded_at", { mode: "timestamp" }),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

// ── Release Decisions ──

export const releaseDecisions = sqliteTable("release_decisions", {
  id: integer().primaryKey({ autoIncrement: true }),
  mediaId: integer("media_id").notNull(),
  mediaType: text("media_type").$type<MediaType>().notNull(),
  candidateTitle: text("candidate_title").notNull(),
  indexerId: integer("indexer_id"),
  indexerName: text("indexer_name"),
  qualityRank: integer("quality_rank"),
  formatScore: integer("format_score").notNull().default(0),
  decision: text().$type<ReleaseDecision>().notNull(),
  reasons: text({ mode: "json" })
    .$type<ReadonlyArray<DecisionReason>>()
    .notNull()
    .default(sql`'[]'`),
  decidedAt: integer("decided_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const releaseBlocklist = sqliteTable(
  "release_blocklist",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    mediaId: integer("media_id").notNull(),
    mediaType: text("media_type").$type<MediaType>().notNull(),
    candidateTitle: text("candidate_title").notNull(),
    indexerId: integer("indexer_id"),
    indexerName: text("indexer_name"),
    downloadUrl: text("download_url"),
    infohash: text(),
    externalId: text("external_id"),
    reason: text().notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [unique().on(t.mediaId, t.mediaType, t.candidateTitle)],
)

// ── Scheduler ──

export const schedulerConfig = sqliteTable("scheduler_config", {
  id: integer().primaryKey({ autoIncrement: true }),
  jobType: text("job_type").$type<SchedulerJobType>().notNull().unique(),
  intervalMinutes: integer("interval_minutes").notNull(),
  retryDelaySeconds: integer("retry_delay_seconds").notNull().default(60),
  maxRetries: integer("max_retries").notNull().default(3),
  backoffMultiplier: real("backoff_multiplier").notNull().default(2),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
})

// ── Onboarding ──

export const setupState = sqliteTable("setup_state", {
  id: integer().primaryKey({ autoIncrement: true }),
  path: text({ enum: ["quickstart", "wizard"] }),
  currentStep: text("current_step"),
  completedSteps: text("completed_steps", { mode: "json" })
    .$type<ReadonlyArray<string>>()
    .notNull()
    .default(sql`'[]'`),
  capabilities: text({ mode: "json" })
    .$type<{ readonly movies: boolean; readonly tv: boolean }>()
    .notNull()
    .default(sql`'{"movies":true,"tv":true}'`),
  startedAt: integer("started_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  completedAt: integer("completed_at", { mode: "timestamp" }),
})

export const setupLog = sqliteTable("setup_log", {
  id: integer().primaryKey({ autoIncrement: true }),
  stepName: text("step_name").notNull(),
  action: text().notNull(),
  result: text({ enum: ["success", "failure", "skipped"] }).notNull(),
  message: text(),
  reversible: integer({ mode: "boolean" }).notNull().default(false),
  rolledBack: integer("rolled_back", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const schedulerJobs = sqliteTable("scheduler_jobs", {
  id: integer().primaryKey({ autoIncrement: true }),
  jobType: text("job_type").$type<SchedulerJobType>().notNull(),
  status: text().$type<SchedulerJobStatus>().notNull().default("pending"),
  dedupeKey: text("dedupe_key").notNull(),
  payload: text({ mode: "json" }).$type<SchedulerJobPayload>().notNull(),
  attempts: integer().notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  nextRunAt: integer("next_run_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

// ── Operational History And Logs ──

export const systemLogs = sqliteTable("system_logs", {
  id: integer().primaryKey({ autoIncrement: true }),
  timestamp: integer({ mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  level: text().$type<SystemLogLevel>().notNull(),
  message: text().notNull(),
  context: text({ mode: "json" })
    .$type<Record<string, unknown> | null>()
    .default(sql`'null'`),
})

export const domainHistory = sqliteTable("domain_history", {
  id: integer().primaryKey({ autoIncrement: true }),
  eventType: text("event_type").$type<DomainHistoryEventType>().notNull(),
  mediaKind: text("media_kind").$type<DomainHistoryMediaKind>(),
  movieId: integer("movie_id"),
  seriesId: integer("series_id"),
  seasonId: integer("season_id"),
  episodeId: integer("episode_id"),
  releaseDecisionId: integer("release_decision_id"),
  releaseTitle: text("release_title"),
  indexerId: integer("indexer_id"),
  indexerName: text("indexer_name"),
  downloadClientId: integer("download_client_id"),
  downloadClientName: text("download_client_name"),
  downloadExternalId: text("download_external_id"),
  schedulerJobId: integer("scheduler_job_id"),
  notificationDeliveryId: integer("notification_delivery_id"),
  title: text().notNull(),
  message: text().notNull(),
  metadata: text({ mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'`),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})
