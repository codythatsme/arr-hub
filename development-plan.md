# ARR Hub Development Plan

Date: 2026-05-09

Purpose: turn the current codebase into a viable all-in-one replacement for Sonarr, Radarr, and Prowlarr. This plan is based on the current ARR Hub workspace plus local references under `vendor/sonarr`, `vendor/radarr`, and `vendor/prowlarr`.

## Executive Verdict

ARR Hub has a credible foundation, but it is not yet a viable Sonarr/Radarr/Prowlarr replacement.

What exists today:

- TanStack Start + tRPC + Effect service architecture.
- SQLite/Drizzle schema for users, API keys, movies, series/seasons/episodes, quality profiles, custom formats, indexers, download clients, media servers, queue, notifications, plugins, release decisions, scheduler, onboarding, and Plex playback history.
- Built-in adapters for qBittorrent, SABnzbd, Torznab/Newznab, Plex, and experimental Jellyfin.
- Basic release parsing, quality/profile scoring, search/grab pipeline, queue polling, and scheduler loop.
- First-run onboarding, local admin login, API key creation, Dockerfile/compose, and a system health endpoint.
- Plex-oriented dashboard/history/users/stats functionality.

Primary blockers:

- The operator UI now exposes the existing backend workflows, but persisted browser smoke tests are still missing and deeper workflows still depend on backend work listed below.
- Metadata is thin. Movies have a TMDB client, but TV has no real metadata provider, Sonarr import does not import episodes, and there is no metadata refresh lifecycle.
- Completed download handling is not a real media import pipeline. It mostly marks rows as available; it does not inspect, move, hardlink, rename, validate, or import files.
- The release decision engine is far smaller than Sonarr/Radarr. It lacks many required rejection rules, blocklist enforcement, size/age/retention/free-space checks, language/release profiles, proper title matching, and TV/anime edge cases.
- Prowlarr replacement scope is mostly absent. The app only consumes Torznab/Newznab endpoints; it does not manage a Prowlarr-scale indexer catalogue, Cardigann definitions, indexer proxies, stats, app sync, or external Torznab/Newznab proxy endpoints.
- Download client coverage is narrow: qBittorrent and SABnzbd only.
- There is no Radarr/Sonarr/Prowlarr REST API compatibility layer, which matters if existing tools are expected to treat ARR Hub as a drop-in replacement.

## Verification Snapshot

Commands run from `/Users/codythatsme/Developer/arr-hub`:

- `bun run typecheck`: passed.
- `bun run test`: passed, 29 test files plus 1 skipped live suite, 285 passed and 4 skipped tests.
- `bun run lint`: passed with warnings and 0 errors.
- `bun run build`: passed with chunk-size and external dependency warnings.

Mechanical health is acceptable. Product completeness is the issue.

## Implementation Progress On 2026-05-09

Completed in atomic commits after this plan was written:

- `0246b446ef` added indexer settings CRUD/test UI.
- `d206f4bbd0` added download client settings CRUD/test UI.
- `540ea82ddd` added media server settings CRUD/test/library UI.
- `11749d1d36` added scheduler config/status/job controls.
- `0217f93ff0` added general settings UI.
- `4e2f66d121` added media-management/root-folder UI.
- `7ed65c3088` added movie add/edit/delete/monitor/profile/root/manual-search UI.
- `0b5d2a1553` added TV manual add/edit/delete/monitor/season/episode search UI.
- `688ac6f283` added profile create/edit/delete/apply-bundle UI.
- `ab7f7dbffa` added queue delete-files and clear-error actions.

Milestone 1 is functionally implemented for the current backend, except persisted browser smoke tests. Later milestones remain open and are still required before ARR Hub can honestly claim Sonarr/Radarr/Prowlarr replacement-grade behavior.

## Current Functionality Inventory

Backend/service surfaces:

- `src/db/schema.ts`: core tables for admin auth, media, profiles, integrations, queue, Plex/session analytics, notifications, plugins, release decisions, scheduler, and onboarding.
- `src/effect/services/MovieService.ts`: CRUD/list/lookup over local movie rows.
- `src/effect/services/SeriesService.ts`: CRUD/list/local lookup, season/episode monitor toggles, basic calendar.
- `src/effect/services/TmdbClient.ts`: movie-only TMDB search/details/popular/trending.
- `src/effect/services/IndexerService.ts` and `src/effect/services/TorznabAdapter.ts`: Torznab/Newznab connection testing and search.
- `src/effect/services/DownloadClientService.ts`, `QBittorrentAdapter.ts`, `SABnzbdAdapter.ts`: add/list/test/grab/queue/remove downloads for qBittorrent and SABnzbd.
- `src/effect/services/ReleasePolicyEngine.ts`: parses titles, checks allowed quality, custom format score, and basic upgrade scoring.
- `src/effect/services/AcquisitionPipeline.ts`: movie search/evaluate/grab, episode search/evaluate/grab, season pack first search, series search.
- `src/effect/services/DownloadMonitor.ts`: polls download clients, updates queue rows, marks linked media available on completion, triggers Plex library refresh.
- `src/effect/services/MediaServerService.ts` and `PlexAdapter.ts`: Plex connection, libraries, library sync matching, refresh, active sessions, shared users.
- `src/effect/services/PlexSessionMonitor.ts`: active stream monitoring and notification trigger emission.
- `src/effect/services/NotificationService.ts`: in-app and webhook notification channels.
- `src/effect/services/SchedulerService.ts` and `SchedulerLoop.ts`: recurring RSS/cutoff/download monitor jobs plus TV job types.
- `src/effect/services/ImportService.ts`: one-time setup import from Radarr movies and Sonarr series.
- `src/effect/services/PluginLoader.ts`: trusted local plugin loading.

UI surfaces:

- Dashboard, Movies list/detail, TV list/detail.
- Movies: TMDB search/add, edit/delete, monitor toggle, profile/root assignment, manual release evaluate/grab.
- TV: manual series add with season/episode scaffolding, edit/delete, show/season/episode monitor toggles, series/season search, episode evaluate/grab.
- Activity queue/history/users/stats. Queue supports retry, remove with delete-files option, clear error, and blocklist.
- Settings: indexers, download clients, media servers, scheduler, general, media management/root folders, notifications, profiles, security, and plugins now have operational UI.
- Onboarding quickstart and advanced wizard.
- System diagnostics view.

## Vendor Reference Baseline

Use these local vendor areas as feature references:

- Sonarr core: `vendor/sonarr/src/NzbDrone.Core/Tv`, `MediaFiles/EpisodeImport`, `IndexerSearch`, `DecisionEngine/Specifications`, `Download`, `Queue`, `Blocklisting`, `ImportLists`, `Organizer`, `DataAugmentation/Scene`, `DataAugmentation/Xem`, `Notifications`, `RemotePathMappings`, `HealthCheck`.
- Radarr core: `vendor/radarr/src/NzbDrone.Core/Movies`, `MediaFiles/MovieImport`, `IndexerSearch`, `DecisionEngine/Specifications`, `Download`, `Queue`, `Blocklisting`, `ImportLists`, `Organizer`, `MovieStats`, `Notifications`, `RemotePathMappings`, `HealthCheck`.
- Prowlarr core: `vendor/prowlarr/src/NzbDrone.Core/Indexers`, `Indexers/Definitions`, `IndexerProxies`, `IndexerStats`, `IndexerVersions`, `Applications`, `Download`, `History`, `Notifications`.

Important scale differences visible in vendor:

- Radarr has 31 decision-engine specification files; Sonarr has 41. ARR Hub has one compact `ReleasePolicyEngine`.
- Prowlarr has 143 files under `Indexers/Definitions` and 16 first-level definition families. ARR Hub has only generic Torznab/Newznab consumption.
- Sonarr/Radarr support many download client families: qBittorrent, SABnzbd, NZBGet, Transmission, Deluge, rTorrent, uTorrent, Download Station, blackhole, and others. ARR Hub has qBittorrent and SABnzbd.
- Sonarr/Radarr have full media import pipelines with manual import, sample detection, free-space checks, upgrade checks, folder matching, grabbed-release matching, and naming services. ARR Hub has no equivalent file import pipeline yet.

## Replacement-Grade Definition

ARR Hub should be considered viable only when it can do the following without direct database edits or custom scripts:

1. Add, discover, monitor, search, grab, import, rename, upgrade, and remove movies and TV episodes.
2. Manage indexers directly or expose a clear Prowlarr-equivalent indexer aggregation/proxy surface.
3. Connect to common download clients and reliably import completed downloads.
4. Apply release decisions with enough rules to avoid bad grabs and prevent repeated failed grabs.
5. Persist history, blocklists, health, logs, and settings across restarts.
6. Provide an operator UI for the full day-to-day workflow.
7. Run in Docker/NAS environments with correct media/download volume and permission behavior.
8. Either expose compatible Sonarr/Radarr/Prowlarr REST APIs or explicitly document that existing ecosystem clients are not drop-in compatible.

## P0 Release Blockers

### 1. Finish Operator UI For Core Workflows

Current state:

- `src/routes/settings/indexers.tsx`, `download-clients.tsx`, `media-servers.tsx`, `scheduler.tsx`, `general.tsx`, and `media-management.tsx` are placeholder pages.
- `src/routes/movies/index.tsx` and `src/routes/tv/index.tsx` mostly list existing rows.
- Backend tRPC routers already expose more behavior than the UI uses.

Gap:

- An operator cannot manage ARR Hub like Sonarr/Radarr/Prowlarr through the web app.

Tasks:

- Build CRUD/test forms for indexers, download clients, media servers, root folders, and scheduler config.
- Build movie add/search UI using TMDB search and movie details.
- Build TV add/search UI after TV metadata support exists.
- Build manual search/evaluate/grab UI for movies, series, seasons, and episodes.
- Add edit/delete/monitor toggles, quality profile selection, root folder selection, and status filters.
- Add profile create/edit/delete/apply bundle UI, not just inspect/preview.
- Add queue actions with delete-files option and clear error handling.
- Add scheduler jobs/config UI with pause/resume/retry and recent job details.

Acceptance criteria:

- A fresh install can be configured entirely from UI after onboarding.
- A user can add a movie/show, search, manually inspect releases, grab one, see queue progress, and see the item become available.
- Existing backend procedures have matching user-facing paths or are intentionally internal.

### 2. Build Real Metadata Lifecycle

Current state:

- `TmdbClient` supports movies only.
- `MovieService.lookup` and `SeriesService.lookup` search local database rows, not external metadata.
- Series/episode data must be manually supplied or imported partially.
- Sonarr import inserts series and seasons only, not episodes.

Gap:

- Sonarr/Radarr replacements need metadata refresh, episode lists, air dates, titles, artwork, alternate titles, IDs, and continuing/ended status updates.

Tasks:

- Add TV metadata provider support. Use TVDB/SkyHook-compatible behavior from `vendor/sonarr/src/NzbDrone.Core/MetadataSource/SkyHook` as the reference, or choose a current API and document credentials.
- Extend schema for external IDs and metadata fields:
  - Movies: imdbId, originalTitle, runtime, release dates, minimum availability, alternate titles, collections, ratings, metadata refresh timestamp.
  - Series: tvdbId plus imdb/tmdb where available, series type, certification, genres, network, runtime, status, alternate titles, metadata refresh timestamp.
  - Episodes: external IDs, season/episode/absolute episode numbers, title, air date/time, overview, monitored state, file linkage.
- Implement metadata refresh jobs for movies and series.
- Implement "Add Movie" and "Add Series" flows that hydrate metadata before insert.
- Fix `ImportService.importFromSonarr` to import episodes, file status, episode file paths, monitored flags, air dates, and existing quality when available.
- Add image handling strategy. At minimum store remote artwork URLs consistently; later add local cover cache like Sonarr/Radarr.

Acceptance criteria:

- Adding a TV show creates seasons and episodes automatically.
- Existing series stay current after metadata refresh.
- Sonarr import preserves episodes and available/missing state.
- Calendar is populated from real episode air dates.

### 3. Implement Media File Import, Rename, And Library Scanning

Current state:

- `DownloadMonitor.checkCompletions` marks linked movies/episodes as `hasFile=true` when a queue item is completed.
- It does not inspect downloaded files, move/copy/hardlink media, rename files, select the right file, detect samples, check free space, or set real quality names.
- Settings include `media.namingConvention` and `media.fileHandling`, but no file pipeline consumes them.
- `RootFolderService` records paths and best-effort disk space only.

Gap:

- This is the largest gap versus Sonarr/Radarr. A replacement must own the completed download import pipeline.

Tasks:

- Create a `MediaImportService` or equivalent with movie and episode import paths.
- Use vendor references:
  - `vendor/radarr/src/NzbDrone.Core/MediaFiles/MovieImport`
  - `vendor/sonarr/src/NzbDrone.Core/MediaFiles/EpisodeImport`
  - `vendor/radarr/src/NzbDrone.Core/Organizer`
  - `vendor/sonarr/src/NzbDrone.Core/Organizer`
- Implement completed download import:
  - Resolve download client output path.
  - Apply remote path mappings.
  - Wait for unpacking/repair/post-processing to finish.
  - Enumerate files and filter samples/extras.
  - Parse title and match against grabbed media.
  - Reject wrong movie/show/episode, wrong season, split/multi-episode mismatches, low quality, and bad upgrades.
  - Move/copy/hardlink into root folder.
  - Build final file name from naming settings.
  - Store `filePath`, quality, size, import date, and media info.
  - Trigger media server library refresh with the imported file/folder path.
- Add manual import workflow.
- Add rescan existing library workflow.
- Add rename preview and rename action.
- Add recycle bin/delete behavior or document explicit non-support.

Acceptance criteria:

- A completed qBittorrent or SABnzbd download results in a real file in the configured movie/series folder.
- Wrong files remain rejected with visible reasons.
- Repeated scheduler runs are idempotent.
- Existing libraries can be scanned into ARR Hub without coming from downloads.

### 4. Expand Release Decision Engine To Sonarr/Radarr Parity

Current state:

- `ReleasePolicyEngine` does basic title parsing, allowed quality checks, custom format scoring, and simple upgrade decisions.
- `QueueService.blocklist` records a rejected `release_decisions` row, but future searches do not consult a real blocklist.
- `TitleParserService` handles common movie and simple TV patterns, but not the full Sonarr/Radarr parser surface.

Gap:

- The app will make unsafe grabs. It lacks many decision checks used by Sonarr/Radarr.

Tasks:

- Split decision logic into specification modules modeled after:
  - `vendor/radarr/src/NzbDrone.Core/DecisionEngine/Specifications`
  - `vendor/sonarr/src/NzbDrone.Core/DecisionEngine/Specifications`
- Add persistent blocklist tables and check them during decision evaluation.
- Add title/year/ID matching so a release must actually match the target movie/show/episode.
- Add size checks: minimum size, maximum size, acceptable size by runtime/quality, free disk space.
- Add protocol checks and per-indexer/per-download-client protocol restrictions.
- Add queue conflict checks to avoid duplicate grabs.
- Add retention/minimum age/delay profile behavior.
- Add torrent seed/leech/ratio/time constraints.
- Add release restrictions: required, ignored, preferred terms, tags.
- Add language support if replacement scope includes non-English libraries.
- Add hardcoded subtitle/sample/raw disk checks.
- Add repack/proper handling.
- Add TV-specific checks:
  - air date gating,
  - season pack only / full season,
  - multi-season packs,
  - split episodes,
  - same episode/season already grabbed,
  - anime absolute episode and version upgrades,
  - scene/XEM mapping.
- Store and display every rejection reason in manual search.

Acceptance criteria:

- Manual search shows accepted/skipped/rejected decisions with clear reasons.
- Blocklisted releases are never grabbed again unless manually cleared.
- The unit suite covers each decision specification and key Sonarr/Radarr edge cases.

### 5. Build Prowlarr-Grade Indexer Management

Current state:

- ARR Hub can consume Torznab/Newznab endpoints.
- There is no first-party indexer catalogue, Cardigann/YAML definition support, FlareSolverr/proxy support, indexer stats, definition updates, or external Torznab/Newznab proxy endpoint.

Gap:

- This is not a Prowlarr replacement yet. It can use Prowlarr as an upstream, but cannot replace it.

Tasks:

- Decide the product stance:
  - Option A: ARR Hub replaces Prowlarr directly. Implement indexer definitions and proxy endpoints.
  - Option B: ARR Hub intentionally uses Prowlarr-compatible Torznab/Newznab upstreams. Document that Prowlarr replacement is out of scope.
- If Option A:
  - Model indexer definitions after `vendor/prowlarr/src/NzbDrone.Core/Indexers/Definitions`.
  - Add Cardigann/YAML definition support.
  - Add indexer-specific auth fields, cookies, 2FA notes, category mapping, caps, tags, priority, and enable/disable state.
  - Add indexer proxy support from `vendor/prowlarr/src/NzbDrone.Core/IndexerProxies`: HTTP, SOCKS4, SOCKS5, FlareSolverr.
  - Add rate limiting, retry/backoff, and automatic disable/health status.
  - Add indexer statistics from `vendor/prowlarr/src/NzbDrone.Core/IndexerStats`.
  - Add definition version updates from `vendor/prowlarr/src/NzbDrone.Core/IndexerVersions`.
  - Expose aggregate Torznab/Newznab endpoints for external apps if ARR Hub should act like Prowlarr.
  - Optionally add Prowlarr application sync behavior from `vendor/prowlarr/src/NzbDrone.Core/Applications` if external Sonarr/Radarr instances should still be supported.

Acceptance criteria:

- A user can add common public/private trackers/indexers without running Prowlarr.
- Searches return normalized releases with reliable categories, protocol, seeders, age, infohash, and download URLs.
- Indexer failures and rate limits are visible and affect health.

### 6. Expand Download Client Coverage And Completed Download Control

Current state:

- Built-in download clients are qBittorrent and SABnzbd.
- Client settings are minimal.
- There are no remote path mappings.

Gap:

- Sonarr/Radarr users commonly rely on Transmission, Deluge, rTorrent, uTorrent, NZBGet, Download Station, blackhole folders, and remote path mappings.

Tasks:

- Add first-party adapters for at least:
  - Transmission,
  - Deluge,
  - NZBGet,
  - torrent blackhole,
  - usenet blackhole.
- Add remote path mappings with host/client/source/destination fields.
- Add per-client categories/tags, priority, recent priority, add-paused, remove-completed, and remove-failed options where supported.
- Add client-specific validation and UI fields.
- Improve qBittorrent hash detection. Returning `"unknown"` as a fallback external ID is unsafe for repeated grabs.
- Track completed download history separately from active queue.

Acceptance criteria:

- Common Docker/NAS setups with separate download and media containers can import correctly.
- Removing a queue item can optionally remove files from the download client and is reflected locally.

### 7. Add True RSS Sync And Wanted/Cutoff Search Behavior

Current state:

- `SchedulerLoop` job `rss_sync` loops over every wanted movie and performs active title search.
- `tv_rss_sync` loops over every wanted episode and performs active search.
- There is no recent-release cache or true RSS feed processing.

Gap:

- Sonarr/Radarr RSS sync does not repeatedly active-search every wanted item. It consumes recent releases, matches them against wanted monitored media, and decides whether to grab.

Tasks:

- Add indexer RSS/recent feed support distinct from active search.
- Store recent releases with indexer/source metadata.
- Match recent releases to movies/episodes before decision evaluation.
- Add per-indexer RSS/search enable flags.
- Add backoff and health checks for failing RSS endpoints.
- Add cutoff unmet queries for movies and episodes based on profile cutoff state.

Acceptance criteria:

- RSS sync can grab a newly posted release for monitored media without active-searching the entire library.
- Search missing/cutoff jobs can be manually scheduled and observed in the UI.

### 8. Persist Operational History And Logs

Current state:

- Plex playback history is persisted.
- Release decisions are persisted.
- Diagnostics logs are in-memory only.
- There is no full history of grabs, imports, renames, deletes, failed downloads, blocklist additions, metadata refreshes, or settings changes.

Gap:

- Sonarr/Radarr/Prowlarr expose history for debugging and auditing. ARR Hub cannot yet answer "what happened to this movie/episode/download?"

Tasks:

- Add domain history tables for:
  - grabbed,
  - download failed,
  - imported,
  - import failed,
  - renamed,
  - deleted,
  - blocklisted,
  - metadata refreshed,
  - indexer/download client health changes,
  - notification deliveries.
- Persist structured logs or add a log-file ingestion/viewing path.
- Link history rows to media, episode, release, indexer, download client, and scheduler job where possible.
- Add history filters in UI.

Acceptance criteria:

- Every automated action has a history row with timestamps and useful context.
- Logs survive process restart or are explicitly sourced from a persistent log file.

### 9. Harden Security And API Boundaries

Current state:

- Local admin login and API keys exist.
- tRPC app procedures are authenticated after onboarding.
- Onboarding and import routers are public because they are setup flows.
- There is no Sonarr/Radarr/Prowlarr-compatible REST API.

Gap:

- Replacement-grade software needs clear API boundaries, ecosystem compatibility decisions, and setup-only endpoint hardening.

Tasks:

- Gate setup/import public procedures so they reject once setup is complete, including connection-test endpoints where appropriate.
- Add rate limiting or lockout for login.
- Add password change/reset flow.
- Add API key scoping if external API compatibility is implemented.
- Decide whether to implement compatible `/api/v3` Sonarr/Radarr-style endpoints and Prowlarr-style `/api/v1`/Torznab endpoints.
- Add OpenAPI or equivalent docs for public APIs.
- Audit secret redaction in errors, logs, diagnostics, and UI.

Acceptance criteria:

- After onboarding, unauthenticated setup/import mutation attempts fail.
- External integrations have a documented API path.
- No API key, token, password, cookie, or webhook secret is returned in normal logs or diagnostics.

### 10. Deployment, Storage, And NAS Readiness

Current state:

- `Dockerfile` and `compose.yml` exist.
- Compose only mounts `/data`.
- There is no explicit media/download volume and permission model.

Gap:

- A practical Arr replacement must run on Docker/NAS hosts with stable UID/GID, media/download mounts, and backup/restore behavior.

Tasks:

- Add compose examples for media and downloads volumes.
- Add UID/GID/PUID/PGID or documented runtime user behavior.
- Add backup/restore docs and possibly scheduled backup jobs.
- Add data migration checks and startup failure messages.
- Add health checks for root folder accessibility and write permissions.
- Add `.env.example`.

Acceptance criteria:

- A user can deploy via compose, mount downloads/media, import files, and restart without losing access to encrypted credentials.
- Health view reports folder permission issues clearly.

## P1 Functional Gaps

### Import Lists

Current state:

- Only one-time setup import from Radarr and Sonarr exists.

Gap:

- Radarr/Sonarr import lists are ongoing sources of wanted items.

Tasks:

- Add continuous import lists modeled after:
  - Radarr: `vendor/radarr/src/NzbDrone.Core/ImportLists`
  - Sonarr: `vendor/sonarr/src/NzbDrone.Core/ImportLists`
- Prioritize Trakt, TMDB lists, RSS/custom lists, Plex watchlists, Radarr/Sonarr import lists, and exclusions.
- Add sync schedule, preview, auto-add controls, root folder/profile defaults, and exclusions.

### Notifications

Current state:

- In-app and webhook channels exist.
- Event coverage is mostly Plex monitoring and notification delivery records.

Gap:

- Sonarr/Radarr/Prowlarr notify on grab, import, upgrade, rename, health issues, application updates, failures, manual interaction required, and more, across many providers.

Tasks:

- Add event emissions for grab/import/upgrade/fail/blocklist/health/update.
- Add provider adapters for Discord, Slack, Telegram, email/SMTP, Notifiarr, Ntfy, Pushover, Gotify, Apprise, and custom scripts.
- Add per-event notification settings and test-send UI.

### Tags, Filters, And Auto Tagging

Current state:

- No tags table or auto-tagging behavior was found.

Gap:

- Tags drive restrictions, indexer/client assignment, import lists, notifications, custom filters, and automation.

Tasks:

- Add tags schema and UI.
- Attach tags to movies, series, indexers, download clients, notifications, import lists, release profiles, and delay profiles.
- Add custom filters and auto-tagging rules modeled after Sonarr/Radarr `AutoTagging` and `CustomFilters`.

### Health Checks

Current state:

- Integration health is recorded when tests are run and aggregated in diagnostics.

Gap:

- Sonarr/Radarr/Prowlarr have many proactive health checks.

Tasks:

- Add checks for root folder missing/unwritable, indexer search/RSS failures, all-indexers-disabled, download client unavailable, remote path missing, download client not removing completed downloads, clock skew, app data path, update availability, and import mechanism problems.
- Show checks in System and relevant settings pages.

### Backup, Update, And Maintenance Jobs

Current state:

- No first-class backup/update workflow beyond Docker docs and Drizzle migrations.

Gap:

- Existing Arr apps have backup, update, housekeeping, and migration operational flows.

Tasks:

- Add scheduled database backups.
- Add backup download/restore UI.
- Add housekeeping jobs for old jobs, old logs, old release decisions, stale queue, old notifications, and old sessions.
- Add update status display or explicitly document container-only updates.

## P2 Compatibility And Polish

### API Compatibility

Decision needed:

- If "replacement" means external tools can point at ARR Hub, implement REST compatibility for relevant Sonarr/Radarr/Prowlarr endpoints.
- If not, document "not API-compatible with Sonarr/Radarr/Prowlarr" prominently.

Recommended minimum:

- Compatible read/write endpoints for movies, series, episodes, queue, history, wanted, calendar, commands, indexers, download clients, root folders, quality profiles, custom formats, tags, system status, and health.
- Prowlarr aggregate Torznab/Newznab endpoints.

### Plugin System

Current state:

- Trusted local in-process plugins exist.

Gaps:

- No sandboxing, no author docs, no compatibility versioning, no marketplace/distribution flow.

Tasks:

- Add plugin author documentation.
- Add capability version negotiation.
- Add plugin log/health UI.
- Decide whether plugins can cover indexer definitions or only adapters.

### Plex/Tautulli Scope

Current state:

- Plex live session/history/user/stats functionality is stronger than a normal Sonarr/Radarr/Prowlarr replacement requirement.

Recommendation:

- Keep Plex analytics as a differentiator, but do not let it block core Arr replacement work.
- If pursuing Tautulli replacement later, create a separate milestone.

## Schema Gaps To Add

Likely new tables or table expansions:

- `movie_files`, `episode_files`, `media_info`, `extra_files`, `subtitle_files`.
- `blocklist` with media linkage, source title, protocol, indexer, infohash, reason.
- `history` for grab/import/rename/delete/fail/metadata events.
- `remote_path_mappings`.
- `tags` and join tables.
- `delay_profiles`, `release_profiles`, `quality_definitions`.
- `import_lists`, `import_list_items`, `import_exclusions`.
- `indexer_definitions`, `indexer_categories`, `indexer_stats`, `indexer_proxy`, `indexer_definition_versions`.
- `download_history` or completed download tracking.
- `naming_config`.
- `backups`.
- Expanded metadata fields for movies, series, seasons, and episodes.

## Recommended Agent Implementation Sequence

### Milestone 1: Make The Current Backend Operable

Goal: expose existing capabilities through UI before deep backend rewrites.

Tasks:

1. Done: finish Settings UI for indexers/download clients/media servers/scheduler/general/media-management/root folders.
2. Done: add Movies UI with TMDB search, add, edit, delete, monitor toggle, profile/root folder assignment, manual search/evaluate/grab.
3. Done: add TV UI using existing local series model with manual series/season/episode scaffolding, edit, delete, monitor toggles, and manual episode/season/series search.
4. Done: add profile CRUD/apply-bundle UI.
5. Remaining: add persisted e2e browser smoke tests for onboarding, integration settings, add movie, add TV, manual search display, queue page.

Acceptance:

- No primary nav settings page is a placeholder.
- Main app can be demoed without tRPC scripts.

### Milestone 2: TV Metadata And Sonarr Import Completion

Goal: make TV library management real.

Tasks:

1. Add TV metadata provider service.
2. Create add-series flow that fetches seasons/episodes.
3. Add metadata refresh jobs.
4. Extend Sonarr import to fetch/import episodes and existing episode files.
5. Add calendar UI using real episode data.

Acceptance:

- Importing from Sonarr preserves show/season/episode wanted and available state.
- Adding a new show creates all current episode rows.

### Milestone 3: Completed Download Import Pipeline

Goal: stop faking imports.

Tasks:

1. Add media file model and import service.
2. Add remote path mappings.
3. Implement qBittorrent/SAB completed path resolution.
4. Implement movie import and episode import decisions.
5. Implement move/copy/hardlink and naming config.
6. Add manual import UI.

Acceptance:

- Live qBittorrent/SAB smoke tests can download a fixture file and import it into a media root.
- The database records real file paths and quality.

### Milestone 4: Decision Engine Hardening

Goal: reduce bad grabs and repeated failures.

Tasks:

1. Add blocklist table and enforcement.
2. Port high-impact decision specs first: title match, size, free space, queue conflict, protocol, retention, seeding, release restrictions.
3. Add TV edge specs: full season, multi-season, split episode, same episodes, scene mapping.
4. Expand parser test corpus from vendor tests and fixtures.

Acceptance:

- Manual search decisions are explainable and stable.
- Blocklisting a failed queue item prevents re-grabbing the same title/infohash.

### Milestone 5: Prowlarr Replacement Decision

Goal: decide and implement indexer strategy.

Tasks:

1. Decide Option A or B from P0 section 5.
2. If Option A, implement indexer definitions, proxies, stats, and aggregate endpoints.
3. If Option B, update docs/UI copy to say ARR Hub consumes Prowlarr-compatible indexers but does not replace Prowlarr.

Acceptance:

- Product claims match actual behavior.

### Milestone 6: Download Client Coverage And NAS Hardening

Goal: support common home-server deployments.

Tasks:

1. Add Transmission, Deluge, NZBGet, and blackhole adapters.
2. Add Docker volume examples for `/downloads`, `/movies`, `/tv`.
3. Add UID/GID or permission docs.
4. Add root folder permission health checks.

Acceptance:

- A typical Docker Compose stack can run ARR Hub plus qBittorrent/SAB/Transmission and import files into mounted media paths.

## Documentation Updates Required

Update `README.md` after each milestone:

- Replace optimistic "Available UI Validation Surfaces" statements that are not true for placeholder pages.
- Add clear "current limitations" until replacement-grade work is complete.
- Document API compatibility stance.
- Document Docker volume and permission setup.
- Document required metadata provider API keys.
- Document how to migrate from Sonarr/Radarr/Prowlarr.

## Known Risk Areas

- Scope risk: replacing Sonarr, Radarr, and Prowlarr is three mature products worth of behavior. Keep milestones narrow and acceptance-driven.
- Parser risk: title parsing and release matching have many edge cases. Build a large fixture corpus early.
- File operation risk: import/move/hardlink behavior can destroy user data if wrong. Implement dry-run/manual import and extensive tests before auto-importing.
- Docker/NAS risk: permission and path mapping issues will dominate real deployments. Test with containerized download clients and mounted volumes.
- Prowlarr risk: maintaining indexer definitions is ongoing work, not a one-time feature.

## Immediate Next Step For The Next Agent

Finish the remaining Milestone 1 test gap, then start Milestone 2.

Recommended order:

1. Add persisted browser smoke tests for onboarding, integration settings, add movie, add TV, manual search display, and queue page. The repo does not currently include a browser e2e runner, so choose one explicitly before adding tests.
2. Start Milestone 2 TV metadata provider work and complete Sonarr episode import.
3. Do not begin Prowlarr-scale indexer work before metadata and import behavior are much closer to replacement-grade.
