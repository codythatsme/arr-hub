import { SqlClient } from "@effect/sql"
import * as SqliteDrizzle from "@effect/sql-drizzle/Sqlite"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { Effect, Layer } from "effect"

import * as schema from "#/db/schema"
import { Db } from "#/effect/services/Db"

/** DDL matching src/db/schema.ts — executed before Drizzle layer is created. */
const runDdl = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`PRAGMA foreign_keys = ON`

  yield* sql`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    last_used_at INTEGER,
    expires_at INTEGER,
    revoked_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE quality_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    upgrade_allowed INTEGER NOT NULL DEFAULT 0,
    min_format_score INTEGER NOT NULL DEFAULT 0,
    cutoff_format_score INTEGER NOT NULL DEFAULT 0,
    min_upgrade_format_score INTEGER NOT NULL DEFAULT 1,
    is_default INTEGER NOT NULL DEFAULT 0,
    applied_bundle_id TEXT,
    applied_bundle_version INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tmdb_id INTEGER NOT NULL UNIQUE,
    imdb_id TEXT,
    title TEXT NOT NULL,
    original_title TEXT,
    year INTEGER,
    release_date INTEGER,
    overview TEXT,
    poster_path TEXT,
    genres TEXT NOT NULL DEFAULT '[]',
    runtime_minutes INTEGER,
    status TEXT NOT NULL DEFAULT 'wanted',
    quality_profile_id INTEGER REFERENCES quality_profiles(id),
    root_folder_path TEXT,
    monitored INTEGER NOT NULL DEFAULT 1,
    has_file INTEGER NOT NULL DEFAULT 0,
    file_path TEXT,
    existing_quality_name TEXT,
    existing_quality_rank INTEGER,
    existing_format_score INTEGER,
    metadata_refreshed_at INTEGER,
    added_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE quality_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES quality_profiles(id) ON DELETE CASCADE,
    quality_name TEXT,
    group_name TEXT,
    weight INTEGER NOT NULL,
    allowed INTEGER NOT NULL DEFAULT 1
  )`

  yield* sql`CREATE TABLE custom_formats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    include_when_renaming INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE custom_format_specs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    custom_format_id INTEGER NOT NULL REFERENCES custom_formats(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    field TEXT NOT NULL,
    pattern TEXT NOT NULL,
    negate INTEGER NOT NULL DEFAULT 0,
    required INTEGER NOT NULL DEFAULT 0
  )`

  yield* sql`CREATE TABLE custom_format_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES quality_profiles(id) ON DELETE CASCADE,
    custom_format_id INTEGER NOT NULL REFERENCES custom_formats(id) ON DELETE CASCADE,
    score INTEGER NOT NULL DEFAULT 0,
    UNIQUE(profile_id, custom_format_id)
  )`

  yield* sql`CREATE TABLE series (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tvdb_id INTEGER NOT NULL UNIQUE,
    tmdb_id INTEGER UNIQUE,
    imdb_id TEXT,
    title TEXT NOT NULL,
    original_title TEXT,
    year INTEGER,
    overview TEXT,
    poster_path TEXT,
    status TEXT NOT NULL DEFAULT 'wanted',
    network TEXT,
    genres TEXT NOT NULL DEFAULT '[]',
    runtime_minutes INTEGER,
    series_type TEXT,
    certification TEXT,
    root_folder_path TEXT,
    monitored INTEGER NOT NULL DEFAULT 1,
    quality_profile_id INTEGER REFERENCES quality_profiles(id),
    season_folder INTEGER NOT NULL DEFAULT 1,
    metadata_refreshed_at INTEGER,
    added_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE seasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    tmdb_id INTEGER UNIQUE,
    season_number INTEGER NOT NULL,
    monitored INTEGER NOT NULL DEFAULT 1,
    UNIQUE(series_id, season_number)
  )`

  yield* sql`CREATE TABLE episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    tvdb_id INTEGER NOT NULL UNIQUE,
    tmdb_id INTEGER UNIQUE,
    title TEXT NOT NULL,
    episode_number INTEGER NOT NULL,
    absolute_episode_number INTEGER,
    air_date INTEGER,
    overview TEXT,
    runtime_minutes INTEGER,
    has_file INTEGER NOT NULL DEFAULT 0,
    file_path TEXT,
    monitored INTEGER NOT NULL DEFAULT 1,
    existing_quality_name TEXT,
    existing_quality_rank INTEGER,
    existing_format_score INTEGER,
    UNIQUE(season_id, episode_number)
  )`

  yield* sql`CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE root_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    free_space_bytes INTEGER,
    total_space_bytes INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE indexer_proxies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER,
    username TEXT,
    password_encrypted TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    settings TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE indexer_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    definition_key TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    protocol TEXT NOT NULL,
    implementation TEXT NOT NULL,
    base_url TEXT,
    privacy TEXT NOT NULL DEFAULT 'private',
    supports_rss INTEGER NOT NULL DEFAULT 1,
    supports_search INTEGER NOT NULL DEFAULT 1,
    auth_fields TEXT NOT NULL DEFAULT '[]',
    categories TEXT NOT NULL DEFAULT '[]',
    capabilities TEXT NOT NULL DEFAULT '{"searchTypes":[],"categories":[]}',
    tags TEXT NOT NULL DEFAULT '[]',
    version TEXT NOT NULL DEFAULT 'builtin-1',
    source_yaml TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE indexer_definition_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1,
    pinned_sha256 TEXT,
    last_checked_at INTEGER,
    last_error TEXT,
    last_definition_key TEXT,
    last_version TEXT,
    last_sha256 TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE indexers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    definition_key TEXT,
    base_url TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    config_values_encrypted TEXT NOT NULL DEFAULT '{}',
    proxy_id INTEGER REFERENCES indexer_proxies(id) ON DELETE SET NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    search_enabled INTEGER NOT NULL DEFAULT 1,
    rss_enabled INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 50,
    minimum_seeders INTEGER,
    query_cooldown_seconds INTEGER,
    query_limit_count INTEGER,
    query_limit_window_seconds INTEGER,
    grab_limit_count INTEGER,
    grab_limit_window_seconds INTEGER,
    categories TEXT NOT NULL DEFAULT '[]',
    tags TEXT NOT NULL DEFAULT '[]',
    capabilities TEXT DEFAULT 'null',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE indexer_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    indexer_id INTEGER NOT NULL UNIQUE REFERENCES indexers(id) ON DELETE CASCADE,
    total_searches INTEGER NOT NULL DEFAULT 0,
    successful_searches INTEGER NOT NULL DEFAULT 0,
    failed_searches INTEGER NOT NULL DEFAULT 0,
    total_rss INTEGER NOT NULL DEFAULT 0,
    successful_rss INTEGER NOT NULL DEFAULT 0,
    failed_rss INTEGER NOT NULL DEFAULT 0,
    total_grabs INTEGER NOT NULL DEFAULT 0,
    average_response_time_ms INTEGER,
    last_search_at INTEGER,
    last_rss_at INTEGER,
    last_grab_at INTEGER,
    query_limit_window_started_at INTEGER,
    query_limit_window_searches INTEGER NOT NULL DEFAULT 0,
    grab_limit_window_started_at INTEGER,
    grab_limit_window_grabs INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE indexer_health (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    indexer_id INTEGER NOT NULL UNIQUE REFERENCES indexers(id) ON DELETE CASCADE,
    last_check INTEGER NOT NULL DEFAULT (unixepoch()),
    status TEXT NOT NULL DEFAULT 'unknown',
    error_message TEXT,
    response_time_ms INTEGER
  )`

  yield* sql`CREATE TABLE recent_releases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    indexer_id INTEGER NOT NULL REFERENCES indexers(id) ON DELETE CASCADE,
    release_key TEXT NOT NULL,
    title TEXT NOT NULL,
    indexer_name TEXT NOT NULL,
    indexer_priority INTEGER NOT NULL,
    size INTEGER NOT NULL,
    seeders INTEGER,
    leechers INTEGER,
    age INTEGER NOT NULL,
    download_url TEXT NOT NULL,
    info_url TEXT,
    category TEXT NOT NULL,
    protocol TEXT NOT NULL,
    published_at INTEGER NOT NULL,
    infohash TEXT,
    download_factor REAL NOT NULL DEFAULT 1,
    upload_factor REAL NOT NULL DEFAULT 1,
    first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
    last_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(indexer_id, release_key)
  )`

  yield* sql`CREATE TABLE indexer_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    sync_base_url TEXT NOT NULL,
    sync_api_key_encrypted TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    settings TEXT NOT NULL DEFAULT '{"syncCategories":[],"syncLevel":"full"}',
    last_synced_at INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE indexer_application_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES indexer_applications(id) ON DELETE CASCADE,
    protocol TEXT NOT NULL,
    remote_indexer_id INTEGER NOT NULL,
    remote_indexer_name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(application_id, protocol)
  )`

  yield* sql`CREATE TABLE download_clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    username TEXT NOT NULL,
    password_encrypted TEXT NOT NULL,
    use_ssl INTEGER NOT NULL DEFAULT 0,
    category TEXT,
    priority INTEGER NOT NULL DEFAULT 50,
    enabled INTEGER NOT NULL DEFAULT 1,
    settings TEXT NOT NULL DEFAULT '{"pollIntervalMs":5000}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE download_client_health (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    download_client_id INTEGER NOT NULL UNIQUE REFERENCES download_clients(id) ON DELETE CASCADE,
    last_check INTEGER NOT NULL DEFAULT (unixepoch()),
    status TEXT NOT NULL DEFAULT 'unknown',
    error_message TEXT,
    response_time_ms INTEGER
  )`

  yield* sql`CREATE TABLE download_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    download_client_id INTEGER NOT NULL REFERENCES download_clients(id) ON DELETE CASCADE,
    movie_id INTEGER REFERENCES movies(id) ON DELETE SET NULL,
    series_id INTEGER REFERENCES series(id) ON DELETE SET NULL,
    episode_ids TEXT,
    external_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'queued',
    title TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    progress REAL NOT NULL DEFAULT 0.0,
    eta_seconds INTEGER,
    error_message TEXT,
    output_path TEXT,
    added_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE remote_path_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    download_client_id INTEGER REFERENCES download_clients(id) ON DELETE CASCADE,
    remote_path TEXT NOT NULL,
    local_path TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(download_client_id, remote_path)
  )`

  yield* sql`CREATE TABLE media_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_kind TEXT NOT NULL,
    media_id INTEGER NOT NULL,
    path TEXT NOT NULL UNIQUE,
    source_path TEXT,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    quality_name TEXT,
    quality_rank INTEGER,
    format_score INTEGER NOT NULL DEFAULT 0,
    imported_at INTEGER NOT NULL DEFAULT (unixepoch()),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(media_kind, media_id)
  )`

  yield* sql`CREATE TABLE media_servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    token_encrypted TEXT NOT NULL,
    use_ssl INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    settings TEXT NOT NULL DEFAULT '{"syncIntervalMs":3600000,"monitoringEnabled":true}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE media_server_health (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_server_id INTEGER NOT NULL UNIQUE REFERENCES media_servers(id) ON DELETE CASCADE,
    last_check INTEGER NOT NULL DEFAULT (unixepoch()),
    status TEXT NOT NULL DEFAULT 'unknown',
    error_message TEXT,
    response_time_ms INTEGER
  )`

  yield* sql`CREATE TABLE media_server_libraries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_server_id INTEGER NOT NULL REFERENCES media_servers(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_synced INTEGER,
    UNIQUE(media_server_id, external_id)
  )`

  yield* sql`CREATE TABLE plex_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_server_id INTEGER NOT NULL REFERENCES media_servers(id) ON DELETE CASCADE,
    plex_user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    friendly_name TEXT NOT NULL,
    email TEXT,
    thumb TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_seen_at INTEGER,
    total_play_count INTEGER NOT NULL DEFAULT 0,
    total_watch_time_sec INTEGER NOT NULL DEFAULT 0,
    synced_at INTEGER NOT NULL DEFAULT (unixepoch()),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(media_server_id, plex_user_id)
  )`

  yield* sql`CREATE TABLE session_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_server_id INTEGER NOT NULL REFERENCES media_servers(id) ON DELETE CASCADE,
    plex_user_id TEXT NOT NULL,
    plex_username TEXT NOT NULL,
    rating_key TEXT NOT NULL,
    media_type TEXT NOT NULL,
    title TEXT NOT NULL,
    parent_title TEXT,
    grandparent_title TEXT,
    year INTEGER,
    thumb TEXT,
    started_at INTEGER NOT NULL,
    stopped_at INTEGER NOT NULL,
    duration INTEGER NOT NULL,
    view_offset INTEGER NOT NULL,
    paused_duration_sec INTEGER NOT NULL DEFAULT 0,
    transcode_decision TEXT NOT NULL,
    video_resolution TEXT,
    audio_codec TEXT,
    player TEXT NOT NULL,
    platform TEXT NOT NULL,
    product TEXT,
    ip_address TEXT,
    bandwidth INTEGER,
    is_local INTEGER NOT NULL,
    movie_id INTEGER REFERENCES movies(id) ON DELETE SET NULL,
    episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL
  )`

  yield* sql`CREATE TABLE notification_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    events TEXT NOT NULL DEFAULT '[]',
    settings TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE notification_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER REFERENCES notification_channels(id) ON DELETE SET NULL,
    event TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL,
    error_message TEXT,
    delivered_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE plugins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    path TEXT NOT NULL,
    version TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    capabilities TEXT NOT NULL,
    loaded_at INTEGER,
    error_message TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE release_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_id INTEGER NOT NULL,
    media_type TEXT NOT NULL,
    candidate_title TEXT NOT NULL,
    indexer_id INTEGER,
    indexer_name TEXT,
    quality_rank INTEGER,
    format_score INTEGER NOT NULL DEFAULT 0,
    decision TEXT NOT NULL,
    reasons TEXT NOT NULL DEFAULT '[]',
    decided_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE release_blocklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_id INTEGER NOT NULL,
    media_type TEXT NOT NULL,
    candidate_title TEXT NOT NULL,
    indexer_id INTEGER,
    indexer_name TEXT,
    download_url TEXT,
    infohash TEXT,
    external_id TEXT,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(media_id, media_type, candidate_title)
  )`

  yield* sql`CREATE TABLE scheduler_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_type TEXT NOT NULL UNIQUE,
    interval_minutes INTEGER NOT NULL,
    retry_delay_seconds INTEGER NOT NULL DEFAULT 60,
    max_retries INTEGER NOT NULL DEFAULT 3,
    backoff_multiplier REAL NOT NULL DEFAULT 2,
    enabled INTEGER NOT NULL DEFAULT 1
  )`

  yield* sql`CREATE TABLE setup_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT,
    current_step TEXT,
    completed_steps TEXT NOT NULL DEFAULT '[]',
    capabilities TEXT NOT NULL DEFAULT '{"movies":true,"tv":true}',
    started_at INTEGER NOT NULL DEFAULT (unixepoch()),
    completed_at INTEGER
  )`

  yield* sql`CREATE TABLE setup_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    step_name TEXT NOT NULL,
    action TEXT NOT NULL,
    result TEXT NOT NULL,
    message TEXT,
    reversible INTEGER NOT NULL DEFAULT 0,
    rolled_back INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE scheduler_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    dedupe_key TEXT NOT NULL,
    payload TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    next_run_at INTEGER NOT NULL DEFAULT (unixepoch()),
    started_at INTEGER,
    completed_at INTEGER,
    error_message TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`

  yield* sql`CREATE TABLE system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    context TEXT DEFAULT 'null'
  )`

  yield* sql`CREATE TABLE domain_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    media_kind TEXT,
    movie_id INTEGER,
    series_id INTEGER,
    season_id INTEGER,
    episode_id INTEGER,
    release_decision_id INTEGER,
    release_title TEXT,
    indexer_id INTEGER,
    indexer_name TEXT,
    download_client_id INTEGER,
    download_client_name TEXT,
    download_external_id TEXT,
    scheduler_job_id INTEGER,
    notification_delivery_id INTEGER,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`
})

/**
 * In-memory SQLite + DDL + schema-typed Drizzle.
 * Each `Effect.provide(TestDbLive)` creates a fresh DB — no cross-test pollution.
 */
export const TestDbLive = Layer.effect(
  Db,
  Effect.gen(function* () {
    yield* runDdl
    return yield* SqliteDrizzle.make({ schema })
  }),
).pipe(Layer.provideMerge(SqliteClient.layer({ filename: ":memory:" })))
