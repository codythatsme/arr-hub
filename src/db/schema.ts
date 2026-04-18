import { sql } from "drizzle-orm"
import { integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"

import type { DownloadClientSettings } from "#/effect/domain/downloadClient"
import type { IndexerCapabilities } from "#/effect/domain/indexer"
import type { MediaServerSettings } from "#/effect/domain/mediaServer"
import type { DecisionReason, MediaType, ReleaseDecision } from "#/effect/domain/release"
import type {
  SchedulerJobPayload,
  SchedulerJobStatus,
  SchedulerJobType,
} from "#/effect/domain/scheduler"

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
  title: text().notNull(),
  year: integer(),
  overview: text(),
  posterPath: text("poster_path"),
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
  addedAt: integer("added_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const series = sqliteTable("series", {
  id: integer().primaryKey({ autoIncrement: true }),
  tvdbId: integer("tvdb_id").notNull().unique(),
  title: text().notNull(),
  year: integer(),
  overview: text(),
  posterPath: text("poster_path"),
  status: text({ enum: ["continuing", "ended", "wanted", "available"] })
    .notNull()
    .default("wanted"),
  network: text(),
  rootFolderPath: text("root_folder_path"),
  monitored: integer({ mode: "boolean" }).notNull().default(true),
  qualityProfileId: integer("quality_profile_id").references(() => qualityProfiles.id),
  seasonFolder: integer("season_folder", { mode: "boolean" }).notNull().default(true),
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
    title: text().notNull(),
    episodeNumber: integer("episode_number").notNull(),
    airDate: integer("air_date", { mode: "timestamp" }),
    overview: text(),
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

export const indexers = sqliteTable("indexers", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  type: text().notNull(),
  baseUrl: text("base_url").notNull(),
  apiKeyEncrypted: text("api_key_encrypted").notNull(),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
  priority: integer().notNull().default(50),
  categories: text({ mode: "json" })
    .$type<ReadonlyArray<number>>()
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
  addedAt: integer("added_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

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
