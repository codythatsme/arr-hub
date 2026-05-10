# ARR Hub Development Plan

Date: 2026-05-09

Purpose: turn the current codebase into a viable all-in-one replacement for Sonarr, Radarr, and Prowlarr. This plan is based on the current ARR Hub workspace plus local references under `vendor/sonarr`, `vendor/radarr`, and `vendor/prowlarr`.

## Executive Verdict

ARR Hub has a credible foundation, but it is not yet a viable Sonarr/Radarr/Prowlarr replacement.

What exists today:

- TanStack Start + tRPC + Effect service architecture.
- SQLite/Drizzle schema for users, API keys, movies, series/seasons/episodes, quality profiles, custom formats, indexers, download clients, media servers, queue, notifications, plugins, release decisions, scheduler, onboarding, and Plex playback history.
- Built-in adapters for qBittorrent, SABnzbd, first-pass Transmission, first-pass Deluge, first-pass NZBGet, first-pass torrent/usenet blackholes, Torznab/Newznab, Plex, and experimental Jellyfin.
- Basic release parsing, quality/profile scoring, search/grab pipeline, queue polling, and scheduler loop.
- TMDB-backed movie/TV metadata lookup, metadata-backed add flows, series episode hydration, Sonarr episode import, metadata refresh jobs, and a TV episode calendar.
- First-run onboarding, local admin login, API key creation, Dockerfile/compose with documented media/download mounts, `.env.example`, and a system health endpoint with root-folder accessibility checks.
- Plex-oriented dashboard/history/users/stats functionality.

Primary blockers:

- The operator UI now exposes the existing backend workflows and has persisted browser smoke coverage, but deeper workflows still depend on backend work listed below.
- The metadata lifecycle is now functional for TMDB-backed movie/TV adds, Sonarr episode import, refresh jobs, and calendar population, but still lacks Sonarr/Radarr-depth alternate titles, ratings, local artwork cache, availability semantics, and TVDB/SkyHook parity.
- Completed download handling now has a real import path that resolves completed output paths and remote path mappings, waits for stable completed output/post-processing markers, rejects wrong-media/disallowed-quality/bad-upgrade imports, selects media files, filters samples, renames, checks target free space before file transfers, copy/move/hardlinks into library folders, persists media file records, supports manual import, scans existing libraries, and exposes rename preview/action. It still lacks recycle-bin support and deeper Sonarr/Radarr import parity.
- The release decision engine now has persistent blocklist enforcement, focused specification modules, target title/year/episode/season checks, size/free-space/queue/protocol/client availability checks, minimum age/retention/seeder gates, required/ignored/preferred release terms, sample/hardcoded subtitle/raw-disk rejection, and first-pass TV/anime edge checks. It still lacks full Sonarr/Radarr parity for language profiles, tagged release profiles, deep media inspection, proper/repack version upgrade semantics, scene/XEM mapping, and exhaustive parser coverage.
- Prowlarr replacement now has a first-pass foundation for common setups: generic Newznab and Torznab support, curated Newznab presets for NZBGeek, DrunkenSlug, NZBFinder, NinjaCentral, NZBPlanet, and altHUB, aggregate Torznab/Newznab feeds, persisted definitions, representative Cardigann/YAML torrent coverage, URL-backed checksum-pinned definition sources, proxy/health/stats basics, per-indexer category and policy controls, and first-pass Radarr/Sonarr app sync. The bundled catalogue is now intentionally curated; broad Prowlarr/Jackett-scale tracker breadth is deferred to remote definition sources or a later catalogue-maintenance milestone.
- Download client coverage is still narrow: qBittorrent, SABnzbd, first-pass Transmission, first-pass Deluge, first-pass NZBGet, and first-pass torrent/usenet blackholes only.
- There is no Radarr/Sonarr/Prowlarr REST API compatibility layer, which matters if existing tools are expected to treat ARR Hub as a drop-in replacement.

## Verification Snapshot

Commands run from `/Users/codythatsme/Developer/arr-hub`:

- `bun run typecheck`: passed.
- `bun run test`: passed, 52 test files plus 1 skipped live suite, 509 passed and 4 skipped tests.
- Focused add-paused adapter tests passed for qBittorrent, Transmission, Deluge, NZBGet, and built-in adapter interop.
- Focused download-client remove-policy tests passed for completed-import cleanup and failed-download cleanup.
- Focused import free-space tests passed for settings validation and copy-import reserve rejection.
- Focused notification/history tests passed for channel event subscription edits, direct test-send deliveries, and operational event notification triggers.
- Focused notification provider tests passed for generic webhook payload preservation, Discord/Slack webhook formatting, Ntfy topic delivery, Gotify message delivery, Telegram sendMessage formatting, Pushover form delivery, Apprise API delivery, Notifiarr passthrough delivery, custom script execution, and provider URL/credential/path validation.
- Focused diagnostics tests passed for proactive health checks covering app data, missing root folders, remote path mappings, and completed-download cleanup warnings.
- Focused plugin-loader tests passed for plugin contract status reporting, unsupported capability-version rejection, and plugin lifecycle log retrieval.
- Focused setup-import tests passed for rejecting Radarr/Sonarr connection tests after setup completion without outbound requests.
- Focused auth/startup tests passed for persistent login lockout, failed-attempt cleanup after successful login, TRPC 429 mapping, and startup schema validation.
- Focused auth tests passed for authenticated admin password change, active-session revocation, current-password rejection, and new-password validation.
- Focused diagnostics tests passed for indexer search/RSS failure rollups, unavailable download clients, and stale download-client health checks.
- Settings diagnostics UI wiring passed format, lint, typecheck, and build verification.
- `bun run test:e2e`: last recorded passing smoke coverage for onboarding, settings, add movie, add TV from metadata, manual search display, calendar population, and queue page.
- `bun run lint`: passed with 18 warnings and 0 errors.
- `bun run fmt:check`: passed.
- `bun run build`: passed with chunk-size and external dependency warnings.

Mechanical health is acceptable. Product completeness is the issue.

## Implementation Progress Through 2026-05-10

Completed in atomic commits after this plan was written. Milestone 5 is summarized at the feature level because the broad tracker-catalogue spike was reset out of `main` and preserved only on `backup/milestone5-expanded-catalog`.

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
- `f8c3a19976` added persisted Playwright operator smoke tests and deterministic e2e fixtures.
- `a42c44f420` added TMDB TV search/details/season metadata support.
- `9ebe255f06` added the metadata-backed TV add flow that creates seasons and episodes.
- `0438ca577f` imported Sonarr episodes, files, monitored flags, air dates, and existing quality data.
- `6cb918f655` added movie and series metadata refresh jobs plus scheduler integration.
- `bf7597a151` added a calendar UI populated from real monitored episode air dates.
- `42142ccd4f` persisted completed download output paths from qBittorrent/SABnzbd into queue rows.
- `a99bda9144` added `MediaImportService`, movie/episode import file operations, and monitor-driven completed download imports.
- `41822717a6` added completed import rejection checks for wrong media, wrong episode files, disallowed quality, and bad upgrades.
- `17b120494a` added a completed-output stability delay and post-processing marker checks before imports run.
- `01dd5263dd` added dedicated `media_files` and `remote_path_mappings` persistence, plus remote path resolution during imports.
- `5b249551de` added remote path mapping workflows, manual movie/episode import, library scanning, rename preview/action, and matching UI on settings/movie/TV pages.
- `566abf0e25` added a persistent release blocklist table and blocks matching future release candidates.
- `4df7222527` split high-impact release decisions into specification modules with target title/year/episode/season, size, and torrent seeder checks.
- `fcb481448b` added release free-space and active queue conflict guardrails.
- `1a2d1e0eec` added configurable release guardrails for protocol availability, minimum age, retention, seeders, and required/ignored/preferred release terms.
- `6af5da144a` added TV release edge checks for unaired episodes, multi-episode releases, multi-season packs, and anime absolute episode numbering.
- `0ab6b74069` expanded the title parser test corpus with vendor-inspired release fixtures.
- `b6864bf5f3` added first-pass indexer definition, proxy, and statistics persistence for the selected Prowlarr replacement path.
- `62b0ac1be0` exposed authenticated aggregate Torznab/Newznab XML feeds for external clients.
- `e2ee3e17b8` added a Cardigann-style YAML definition loader and seeded a tiny curated fixture set.
- `6d5a81b696` applied stored HTTP/SOCKS/FlareSolverr proxy settings to outbound Torznab/Newznab requests.
- `f0c0dcb22d` added first-pass indexer search health/backoff handling and automatic disable on authentication failures.
- `a13d8210db` added a first-pass Cardigann YAML search runtime for definition-keyed GET/XML searches.
- `cc1e4cb6b0` added version-aware built-in indexer definition refresh reporting.
- `cf365fed05` added persisted Radarr/Sonarr application records and first-pass aggregate Torznab/Newznab app sync.
- `ea6689495f` added URL-backed Cardigann definition source refresh and DB-backed Cardigann runtime loading.
- `a26561d100` added scheduler-driven refresh for enabled URL-backed Cardigann definition sources.
- `63bcbd41a4` added scheduler-driven Radarr/Sonarr aggregate app sync for enabled applications.
- `d10e8ad82b` added SHA-256 checksum provenance and optional pin verification for URL-backed Cardigann definition sources.
- `bc07c31138` added first-pass per-indexer search policy controls for minimum seeders and query cooldowns.
- `b478385cec` triggered enabled Radarr/Sonarr aggregate app sync after indexer add/update/remove mutations.
- `160651db17` pruned stale remote aggregate app indexers during full app sync.
- `abd28a549d` added Cardigann POST form search path execution for definition-keyed indexers.
- `23569d525d` added Cardigann request header template execution for definition-keyed indexers.
- `a3a8eeaf68` added app-specific torrent seed criteria to aggregate Radarr/Sonarr indexer sync.
- `fa94a0127e` added first-pass rolling query-limit controls for indexers.
- `f781688327` added a Nyaa RSS Cardigann definition to the curated built-in catalogue.
- `1a8499c821` added first-pass rolling grab-limit controls for automatic indexer grabs.
- `1d802069da` added first-pass checksum-pinned catalog manifest import for URL-backed indexer definition sources.
- `213dba943d` added first-pass Cardigann request template filters.
- `6c8a940348` added encrypted definition-specific indexer config/auth values for adapters.
- `c7407922a5` added first-pass indexer definition config/auth UI and preserves omitted stored config secrets on edit.
- `5ac8d517f4` added core Newznab presets for NZBGeek, DrunkenSlug, NZBFinder, NinjaCentral, NZBPlanet, and altHUB without expanding the long-tail Cardigann catalogue.
- `a515123cad` exposed first-pass indexer tags and search/RSS flags in Settings.
- `3915c4f987` exposed first-pass indexer proxy management and assignment controls in Settings.
- `1528454d10` exposed first-pass indexer statistics in Settings.
- `737019c547` exposed first-pass URL-backed definition source management and checksum-pinned catalog imports in Settings.
- `0186ed7e03` exposed first-pass Radarr/Sonarr indexer application sync controls in Settings.
- `fc4d30ab51` exposed first-pass built-in definition refresh controls in Settings.
- `ec7b6f3776` added true RSS/recent-feed sync, cached recent releases, and switched RSS scheduler jobs away from repeated active searches.
- `63f57c0174` constrained movie and episode cutoff search jobs to files below their profile cutoff state.
- `7cc1cabeb4` added persistent operational history, persisted structured system logs, Activity history filters, and history emitters for grabs, download failures, imports, import failures, renames, queue removals, blocklists, metadata refreshes, indexer/download-client health changes, and notification deliveries.
- `8d38ab3f3f` added settings-change history emitters for validated `SettingsService` updates.
- `ca8703c1bf` updated deterministic indexer definition tests for the curated built-in catalogue.
- `beab879376` preserved app-side remote settings during aggregate Radarr/Sonarr app sync updates.
- `904f5f2301` separated Sonarr standard and anime category filters for aggregate app sync.
- `461f775f84` required catalog manifest SHA-256 pins before importing remote definition sources.
- `cac603865f` hardened aggregate Torznab/Newznab compatibility with normalized caps search types, nested category parsing, response/enclosure feed metadata, and deterministic common Newznab-plus-torrent app-sync coverage.
- `52b957e16a` added a first-pass Transmission download client adapter with RPC session negotiation, add/list/remove support, labels, output path reporting, and deterministic adapter tests.
- `89826d0525` added root folder accessibility and write-permission checks to system diagnostics.
- `7b9c771b1c` added Docker Compose media/download volume examples, `.env.example`, current runtime-user permission docs, and backup/restore docs.
- `cbe6a792d5` added first-pass torrent and usenet blackhole adapters with folder validation, submission-file writing, watch-folder scanning, delete-only removal, Settings fields, and deterministic adapter tests.
- `5b598b24c8` added a first-pass NZBGet download client adapter with JSON-RPC connectivity checks, NZB append support, queue/history normalization, remove support, onboarding type wiring, and deterministic adapter tests.
- `38d5392995` added a first-pass Deluge download client adapter with web JSON-RPC authentication, daemon connection, label validation, magnet/torrent-file add support, queue normalization, remove support, onboarding type wiring, and deterministic adapter tests.
- `c9b86a9bd9` added durable completed download history storage, terminal queue-event history writers, a queue history API, and a separate Queue history view.
- `627da8c859` hardened qBittorrent torrent-URL hash recovery and removed the unsafe `"unknown"` external ID fallback.
- `33b19ce6cd` added an add-paused download-client option across qBittorrent, SABnzbd, Transmission, Deluge, and NZBGet, with Settings UI wiring and deterministic adapter coverage.
- `d99b2ef9fd` added opt-in remove-completed and remove-failed download-client policies, fixed download-client settings schema persistence for add-paused, and added deterministic service/monitor coverage.
- `b5dc0e4401` added import-time target free-space checks for copy, move, hardlink, and EXDEV fallback transfers, plus Media Management reserve settings UI.
- `112d1162f7` added editable notification event subscriptions, direct channel test-send delivery, and Settings UI controls for both.
- `7b847c2a4a` bridged operational history rows into notification events for grabs, downloads, imports, renames, deletes, blocklists, metadata refreshes, health changes, and settings changes.
- `4deb114e6b` added proactive diagnostics health checks for app data access, missing root folders, inaccessible remote path mappings, all-disabled integrations, and completed-download cleanup policy warnings.
- `d978dc6518` added plugin author documentation, V1 API/capability version checks, and Settings contract health display.
- `1fbf3287c4` added plugin lifecycle log recording, a plugin-scoped logs API, and a Settings plugin logs panel.
- `3da82c74b7` documented the V1 plugin scope decision: plugins are adapter-only, while Cardigann indexer definitions stay in definition sources.
- `c611c06e74` blocked setup import connection tests after onboarding completion.
- `4b9ff2253f` added persistent login failed-attempt tracking and username lockout with TRPC 429 mapping.
- `9ffc8ca1ae` added authenticated admin password change, active-session revocation, and Security UI controls.
- `78f57560b4` added diagnostics rollups for indexer search/RSS failures plus unavailable and stale download-client health.
- `69036660cf` added first-pass Discord and Slack notification channels with provider-specific webhook payload formatting and Settings UI selection.
- `8cff008239` added a first-pass Ntfy notification channel with topic delivery formatting and Settings UI selection.
- `fd58297cee` added a first-pass Gotify notification channel with message payload formatting and Settings UI selection.
- `a2cd2ef325` added a first-pass Telegram notification channel with HTML-safe sendMessage formatting and Settings UI selection.
- `aefc3e0c70` added a first-pass Pushover notification channel with token/user settings, form-encoded delivery, and Settings UI fields.
- `85e67419d0` added a first-pass Apprise notification channel with saved notify URL delivery and Settings UI selection.
- `a0e4cc55d0` added a first-pass Notifiarr notification channel with passthrough payload delivery and Settings UI fields.
- `c756f06144` added a first-pass custom script notification channel with direct executable invocation, notification environment variables, and Settings UI fields.
- `413824fa91` added filtered diagnostics panels to Indexer, Download Client, Media Server, and Media Management settings pages.
- Subsequent Milestone 5 commits hardened the generic Cardigann runtime, request templating, category mapping, auth controls, and aggregate app-sync behavior enough for representative built-ins and checksum-pinned remote definitions. These commits are runtime support, not a decision to ship the expanded tracker catalogue.
- `5cbb9c9e90` removed the deferred expanded built-in tracker catalogue from `main`. The safety branch `backup/milestone5-expanded-catalog` preserves the catalogue spike at `ab9e42393b`; those tracker definitions, including long-tail and adult/XXX sources, are not current built-in support.

Milestones 1, 2, 3, and 4 are complete for deterministic local coverage against the current backend surface. Milestone 5 is now scoped as a curated Prowlarr replacement foundation, not a broad tracker-porting effort. It includes persisted generic indexer definitions, core Newznab presets for NZBGeek, DrunkenSlug, NZBFinder, NinjaCentral, NZBPlanet, and altHUB, representative Cardigann/YAML torrent definitions, aggregate Torznab/Newznab feeds with offset/extended metadata forwarding, response/enclosure feed metadata, caps search-type normalization, nested category parsing, URL-backed checksum-pinned definition sources, proxy/health/stats basics, per-indexer category and policy controls, deterministic common Newznab-plus-torrent app-sync coverage, and first-pass Radarr/Sonarr aggregate app sync. Long-tail and adult/XXX tracker breadth is deferred to remote definition sources or a future catalogue-maintenance milestone. Milestone 6 now has first-pass Transmission, Deluge, NZBGet, and blackhole coverage plus Docker/NAS volume docs, backup/restore docs, root-folder permission diagnostics, and completed download history separate from active queue state; live multi-container validation remains. Milestone 3 now includes import-time target free-space guards but still needs live qBittorrent/SABnzbd fixture validation in an environment with those services running, and Milestone 5 still needs live common-indexer validation with real credentials before claiming interoperability with specific upstream providers.

## Current Functionality Inventory

Backend/service surfaces:

- `src/db/schema.ts`: core tables for admin auth, media, profiles, integrations, queue, Plex/session analytics, notifications, plugins, release decisions, scheduler, and onboarding.
- `src/effect/services/MovieService.ts`: CRUD/list/lookup over local movie rows.
- `src/effect/services/SeriesService.ts`: CRUD/list/local lookup, season/episode monitor toggles, and monitored episode calendar queries.
- `src/effect/services/TmdbClient.ts`: movie TMDB search/details/popular/trending plus TV search/details/season hydration.
- `src/effect/services/IndexerService.ts`, `src/effect/services/CardigannDefinitionLoader.ts`, `src/effect/services/CardigannAdapter.ts`, `src/effect/services/TorznabAdapter.ts`, `src/effect/services/IndexerDefinitionSourceService.ts`, and `src/effect/services/IndexerApplicationService.ts`: Torznab/Newznab connection testing and search, generic definitions, core Newznab presets, representative Cardigann/YAML definitions, encrypted definition-specific config/auth values, definition source refresh with checksum pinning and catalog manifest import, aggregate Torznab/Newznab feeds, proxy application, search stats, health/backoff state, per-indexer category and policy controls, and first-pass Radarr/Sonarr aggregate app sync. Broad built-in tracker breadth is intentionally deferred.
- `src/effect/services/DownloadClientService.ts`, `QBittorrentAdapter.ts`, `SABnzbdAdapter.ts`, `TransmissionAdapter.ts`, `DelugeAdapter.ts`, `NZBGetAdapter.ts`, and `BlackholeAdapter.ts`: add/list/test/grab/queue/remove downloads for qBittorrent, SABnzbd, first-pass Transmission, first-pass Deluge, first-pass NZBGet, and first-pass torrent/usenet blackholes, including persisted completed output paths where the client reports them.
- `src/effect/services/DiagnosticsService.ts`: aggregates integration health and root-folder accessibility/write-permission checks for the System view and container health endpoint.
- `src/effect/services/ReleasePolicyEngine.ts`: parses titles, checks allowed quality, custom format score, and basic upgrade scoring.
- `src/effect/services/AcquisitionPipeline.ts`: movie search/evaluate/grab, episode search/evaluate/grab, season pack first search, series search, and RSS/recent candidate evaluation for movies and episodes.
- `src/effect/services/MediaImportService.ts`: imports completed movie and episode files from downloader output paths, applies remote path mappings, filters samples, applies copy/move/hardlink settings, builds target names, stores real file paths, media file records, and quality state, supports manual import, scans existing libraries, and previews/applies renames.
- `src/effect/services/DownloadMonitor.ts`: polls download clients, updates queue rows, calls media import for completed linked downloads, leaves failed imports visible in queue, triggers Plex library refresh.
- `src/effect/services/MediaServerService.ts` and `PlexAdapter.ts`: Plex connection, libraries, library sync matching, refresh, active sessions, shared users.
- `src/effect/services/PlexSessionMonitor.ts`: active stream monitoring and notification trigger emission.
- `src/effect/services/NotificationService.ts`: in-app, generic webhook, Discord, Slack, Ntfy, Gotify, Telegram, Pushover, Apprise, Notifiarr, and custom script notification channels.
- `src/effect/services/SchedulerService.ts` and `SchedulerLoop.ts`: recurring true RSS/cutoff/download monitor jobs, TV job types, and metadata refresh jobs.
- `src/effect/services/MetadataRefreshService.ts`: refreshes movie and series metadata from TMDB and upserts season/episode data.
- `src/effect/services/ImportService.ts`: one-time setup import from Radarr movies and Sonarr series, including Sonarr seasons, episodes, file paths, monitored state, and existing quality.
- `src/effect/services/PluginLoader.ts`: trusted local plugin loading with V1 manifest/capability version checks, contract health reporting, and lifecycle log retrieval.

UI surfaces:

- Dashboard, Movies list/detail, TV list/detail, and TV episode calendar.
- Movies: TMDB search/add, edit/delete, monitor toggle, profile/root assignment, manual release evaluate/grab, manual file import, and rename preview/action.
- TV: TMDB metadata search/add with season/episode hydration, manual series add with season/episode scaffolding, edit/delete, show/season/episode monitor toggles, series/season search, episode evaluate/grab, manual episode file import, and series rename preview/action.
- Activity queue/history/users/stats. Queue supports retry, remove with delete-files option, clear error, and blocklist.
- Settings: indexers, download clients, media servers, scheduler, general, media management/root folders/remote path mappings/library scan, notifications, profiles, security, and plugins now have operational UI. Relevant settings pages surface filtered diagnostics health/failure panels. Plugin settings show contract health status and lifecycle logs. Indexer settings also include first-pass Cardigann definition selection, definition-specific config/auth field inputs including select options/defaults, checkbox controls, informational auth notes, and manual CAPTCHA fields without exposing stored secret values, tags, search/RSS toggles, proxy management/assignment controls, stats readouts, built-in definition refresh controls, definition source/catalog management controls with required catalog manifest pins, and Radarr/Sonarr app-sync controls including Sonarr anime category filters.
- Onboarding quickstart and advanced wizard.
- System diagnostics view.

## Vendor Reference Baseline

Use these local vendor areas as feature references:

- Sonarr core: `vendor/sonarr/src/NzbDrone.Core/Tv`, `MediaFiles/EpisodeImport`, `IndexerSearch`, `DecisionEngine/Specifications`, `Download`, `Queue`, `Blocklisting`, `ImportLists`, `Organizer`, `DataAugmentation/Scene`, `DataAugmentation/Xem`, `Notifications`, `RemotePathMappings`, `HealthCheck`.
- Radarr core: `vendor/radarr/src/NzbDrone.Core/Movies`, `MediaFiles/MovieImport`, `IndexerSearch`, `DecisionEngine/Specifications`, `Download`, `Queue`, `Blocklisting`, `ImportLists`, `Organizer`, `MovieStats`, `Notifications`, `RemotePathMappings`, `HealthCheck`.
- Prowlarr core: `vendor/prowlarr/src/NzbDrone.Core/Indexers`, `Indexers/Definitions`, `IndexerProxies`, `IndexerStats`, `IndexerVersions`, `Applications`, `Download`, `History`, `Notifications`.

Important scale differences visible in vendor:

- Radarr has 31 decision-engine specification files; Sonarr has 41. ARR Hub now has a compact release specification module covering high-impact local guardrails, but not the full vendor rule surface.
- Prowlarr has 143 files under `Indexers/Definitions` and 16 first-level definition families. ARR Hub has generic Torznab/Newznab consumption, core Newznab presets, a representative Cardigann/YAML built-in set, URL-backed checksum-pinned definition source refresh, aggregate feeds, proxy/health/stats basics, and first-pass Radarr/Sonarr app sync. Broad bundled tracker coverage is intentionally deferred to remote definition sources or a later catalogue-maintenance milestone.
- Sonarr/Radarr support many download client families: qBittorrent, SABnzbd, NZBGet, Transmission, Deluge, rTorrent, uTorrent, Download Station, blackhole, and others. ARR Hub has qBittorrent, SABnzbd, first-pass Transmission, first-pass Deluge, first-pass NZBGet, and first-pass torrent/usenet blackholes.
- Sonarr/Radarr have full media import pipelines with manual import, sample detection, free-space checks, upgrade checks, folder matching, grabbed-release matching, and naming services. ARR Hub now has a deterministic first-pass import pipeline with manual import, remote path mappings, library scan, rename preview/action, target free-space checks, and media file records, but still lacks full vendor import rejection depth.

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

- Core operator pages now exist for settings, movies, TV, profiles, queue, scheduler, and calendar.
- The UI covers the current backend surface for configuration, add/search/manage, manual release inspection, queue actions, and metadata-backed TV adds.
- Deeper UI work now depends mostly on backend surfaces that do not exist yet, especially curated indexer-management hardening, additional download clients, NAS health checks, and any future compatibility APIs. Media import, rename/rescan, and richer release decision reasons now have first-pass UI/backend coverage.

Gap:

- The core UI gap is closed for the current backend, but replacement-grade UI will still need to expose the later backend features as they are built.

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

- `TmdbClient` supports movies, TV search/details, and TV season hydration.
- Movie and TV add flows can hydrate metadata before insert.
- Series metadata refresh upserts seasons and episodes while preserving monitored/file state.
- Sonarr import now imports series, seasons, episodes, file status, file paths, monitored flags, air dates, and existing quality.
- The calendar UI is populated from monitored episode air dates.

Gap:

- The minimum metadata lifecycle is implemented, but Sonarr/Radarr parity still requires deeper artwork handling, alternate titles, ratings, availability rules, certification details, provider parity, and local cover caching.

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

- `DownloadMonitor.checkCompletions` now calls `MediaImportService` for completed queue items linked to movies or episodes.
- qBittorrent and SABnzbd adapters now persist completed output paths into `download_queue.output_path`.
- `MediaImportService` inspects downloaded files, filters sample files, chooses the largest movie file, matches simple episode files by season/episode, copy/move/hardlinks into root folders, applies movie naming settings, writes real `filePath` values, and stores imported quality state.
- Completed imports are rejected before file operations when release titles target the wrong movie/show/episode, keyed episode files point at the wrong season/episode, the parsed quality is not allowed by the profile, or the import would be a bad upgrade.
- `DownloadMonitor` now defers completed imports while output paths are still within the configured stability delay or contain post-processing marker files/directories.
- Failed imports are left in the queue with a visible error instead of being deleted.
- `MediaImportService` checks target filesystem free space before copy, move, hardlink, and cross-device fallback transfers using the configured minimum free-space reserve.
- `RootFolderService` records paths and best-effort disk space only.

Gap:

- This remains one of the largest gaps versus Sonarr/Radarr. ARR Hub now has a usable completed download import foundation with remote path mappings, manual import, media file records, library scan, rename workflows, completed-output readiness checks, target free-space checks, and first-pass import rejection reasons, but it still lacks deeper edge-case import parity and recycle-bin behavior.

Tasks:

- [x] Create a `MediaImportService` or equivalent with movie and episode import paths.
- Use vendor references:
  - `vendor/radarr/src/NzbDrone.Core/MediaFiles/MovieImport`
  - `vendor/sonarr/src/NzbDrone.Core/MediaFiles/EpisodeImport`
  - `vendor/radarr/src/NzbDrone.Core/Organizer`
  - `vendor/sonarr/src/NzbDrone.Core/Organizer`
- Implement completed download import:
  - [x] Resolve download client output path.
  - [x] Apply remote path mappings.
  - [x] Wait for unpacking/repair/post-processing to finish beyond downloader status normalization.
  - [x] Enumerate files and filter samples/extras.
  - [x] Parse title and match against grabbed media for basic movie and episode imports.
  - [x] Reject wrong movie/show/episode, wrong season, split/multi-episode mismatches, low quality, and bad upgrades with Sonarr/Radarr-grade reasons.
  - [x] Check target free space before import file transfers and expose minimum reserve configuration.
  - [x] Move/copy/hardlink into root folder.
  - [x] Build final file name from naming settings for movies and deterministic TV episode naming.
  - [x] Store `filePath`, quality, and media info.
  - [x] Store file size/import date in dedicated media file records.
  - [x] Trigger media server library refresh after successful import.
- [x] Add manual import workflow.
- [x] Add rescan existing library workflow.
- [x] Add rename preview and rename action.
- [x] Add recycle bin/delete behavior or document explicit non-support. Current stance: recycle-bin behavior is explicitly not supported yet; queue delete-files delegates destructive removal to the download client only, and library file deletes remain out of scope until a dedicated safe-delete workflow exists.

Acceptance criteria:

- A completed qBittorrent or SABnzbd download results in a real file in the configured movie/series folder.
- Wrong files remain rejected with visible reasons.
- Repeated scheduler runs are idempotent.
- Existing libraries can be scanned into ARR Hub without coming from downloads.

### 4. Expand Release Decision Engine To Sonarr/Radarr Parity

Current state:

- `ReleasePolicyEngine` now evaluates a focused specification pipeline before scoring and upgrade decisions.
- `QueueService.blocklist` persists `release_blocklist` rows, and future searches reject matching title/download URL/infohash candidates for the same media context.
- `TitleParserService` handles common movie/TV patterns, season packs, proper/repack detection, and first-pass anime absolute episode numbering, with a vendor-inspired fixture corpus.
- Manual search records and displays accepted/skipped/rejected release decisions with clear rejection reasons.

Gap:

- The app is safer than the initial plan baseline, but it is still not Sonarr/Radarr parity. Remaining gaps include language profiles, tagged release profiles, media-file inspection, nuanced proper/repack/version upgrades, scene/XEM mapping, broader anime behavior, and a much larger parser fixture corpus.

Tasks:

- Split decision logic into specification modules modeled after:
  - `vendor/radarr/src/NzbDrone.Core/DecisionEngine/Specifications`
  - `vendor/sonarr/src/NzbDrone.Core/DecisionEngine/Specifications`
- Add persistent blocklist tables and check them during decision evaluation. Implemented for title/download URL/infohash matches by media context.
- Add title/year/ID matching so a release must actually match the target movie/show/episode. Implemented for target title/year/season/episode and first-pass absolute episode matching; external ID matching remains future work.
- Add size checks: minimum size, maximum size, acceptable size by runtime/quality, free disk space. Implemented fixed minimum/maximum and root-folder free-space checks; runtime/quality-specific size curves remain future work.
- Add protocol checks and per-indexer/per-download-client protocol restrictions. Implemented global allowed protocol settings and enabled download client protocol availability checks.
- Add queue conflict checks to avoid duplicate grabs. Implemented for active queue rows in movie/series/episode context.
- Add retention/minimum age/delay profile behavior. Implemented configurable minimum age and retention gates; full delay profile scheduling remains future work.
- Add torrent seed/leech/ratio/time constraints. Implemented configurable minimum seeders; ratio/time constraints remain future work.
- Add release restrictions: required, ignored, preferred terms, tags. Implemented global required/ignored/preferred terms; tag-scoped profiles remain future work.
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
    First-pass coverage now rejects unaired episode grabs, non-season-pack season results, multi-season packs, split/multi-episode single searches, active queue duplicates, and matching anime absolute episode releases. Anime version upgrades and scene/XEM mapping remain future work.
- Store and display every rejection reason in manual search.

Acceptance criteria:

- Manual search shows accepted/skipped/rejected decisions with clear reasons.
- Blocklisted releases are never grabbed again unless manually cleared.
- The unit suite covers each decision specification and key Sonarr/Radarr edge cases.

### 5. Decide Prowlarr Replacement Scope

Current state:

- ARR Hub can consume configured Torznab/Newznab endpoints and expose authenticated aggregate Torznab/Newznab feeds at `/api/indexers/aggregate/torznab` and `/api/indexers/aggregate/newznab`.
- ARR Hub now seeds generic first-party Torznab/Newznab definitions plus core Newznab presets for NZBGeek, DrunkenSlug, NZBFinder, NinjaCentral, NZBPlanet, and altHUB.
- ARR Hub has representative Cardigann/YAML torrent definitions, encrypted definition-specific config/auth values, proxy configuration, health/backoff state, search statistics, per-indexer category and policy controls, URL-backed checksum-pinned definition sources, checksum-pinned catalog manifest import, scheduler refresh, and first-pass Radarr/Sonarr aggregate app sync.
- The bundled catalogue is intentionally curated for common NZB-heavy setups and a representative torrent path. It is not intended to become Prowlarr-scale inside Milestone 5.

Gap:

- Before ARR Hub can replace Prowlarr for a typical 3 NZB + 1 torrent setup, the common path must be validated with live NZBGeek, DrunkenSlug, NZBFinder or another Newznab preset, plus one Torznab or representative torrent source.
- Kickass/PirateBay-style public torrent coverage should stay out of current Milestone 5 built-ins and be handled through generic Torznab or checksum-pinned remote definitions unless a future catalogue-maintenance milestone explicitly promotes a source.
- Full Cardigann selector/login parity, richer cookie/2FA auth UX, full policy parity, trusted remote catalogue distribution, and richer per-indexer/app-specific sync semantics remain future work.

Decision context:

- Option A remains selected: ARR Hub should replace Prowlarr directly, so users do not need to run Prowlarr alongside it for common setups.
- Scope was adjusted on 2026-05-10: Milestone 5 keeps the replacement foundation and curated common indexers, but freezes broad tracker-by-tracker Cardigann porting.
- Long-tail and adult/XXX tracker breadth belongs in checksum-pinned remote definition sources or a later catalogue-maintenance milestone, not in the current milestone or current built-in support.
- Current Torznab/Newznab support remains a compatibility and migration path.

Tasks:

- [x] Decide the product stance: Option A, direct Prowlarr replacement for common setups.
- [x] Add persisted generic Torznab/Newznab definition models.
- [x] Add core Newznab presets for NZBGeek, DrunkenSlug, NZBFinder, NinjaCentral, NZBPlanet, and altHUB.
- [x] Add Cardigann/YAML runtime support with representative built-in torrent definitions.
- [x] Add encrypted definition-specific config/auth storage and first-pass Settings controls.
- [x] Add proxy configuration, health/backoff, search statistics, category fan-out, minimum-seeder, query-cooldown, and rolling query/grab limit controls.
- [x] Add authenticated aggregate Torznab/Newznab endpoints with pagination and extended metadata forwarding.
- [x] Add URL-backed checksum-pinned definition source refresh and checksum-pinned catalog manifest import.
- [x] Add first-pass Radarr/Sonarr aggregate app sync and Settings controls.
- [x] Freeze broad built-in Cardigann tracker expansion for the current milestone.
- [ ] Validate the target common setup path against live credentials: NZBGeek, DrunkenSlug, NZBFinder, one optional Newznab preset, and one practical torrent path. Deterministic app-sync coverage now exercises this shape locally, but live provider credentials have not been run in this workspace.
- [x] Harden generic Torznab/Newznab configuration, aggregate feed behavior, and app sync around that target path.
- [x] Defer long-tail and adult/XXX tracker breadth to checksum-pinned remote definition sources or a later catalogue-maintenance milestone.

Acceptance criteria:

- ARR Hub can be configured without Prowlarr for common Newznab NZB indexers and at least one practical torrent path.
- Product claims make clear that ARR Hub targets direct Prowlarr replacement for common setups while distinguishing the curated built-in catalogue from Prowlarr-scale tracker breadth.
- No long-tail or adult/XXX tracker definitions are current built-in support, and no more tracker-definition commits are added in Milestone 5 unless they directly fix the generic runtime or serve the curated common-indexer subset.
- Searches still return normalized releases with reliable categories, protocol, seeders, age, infohash, and download URLs from configured upstreams.

### 6. Expand Download Client Coverage And Completed Download Control

Current state:

- Built-in download clients are qBittorrent, SABnzbd, first-pass Transmission, first-pass Deluge, first-pass NZBGet, and first-pass torrent/usenet blackholes. qBittorrent URL grabs now either recover a concrete torrent hash from bounded queue diffs or fail instead of inserting an unsafe `"unknown"` external ID.
- Transmission support covers RPC session negotiation, test connection, torrent-add with label/save path, queue listing with label filtering and output paths, and remove with optional data deletion.
- Deluge support covers web JSON-RPC session authentication, daemon connection, label validation/creation, magnet and torrent-file add flows, queue listing with label filtering and output paths, and remove with optional data deletion.
- NZBGet support covers JSON-RPC version/status/config checks, v16-style NZB append with `drone` parameters, queue/history normalization, category filtering, and queue/history removal.
- Blackhole support covers torrent/NZB submission folder writes, optional magnet-file saving for torrent blackholes, watch-folder scanning for completed media files/folders, stable title-derived external IDs, delete-only removal, and Settings fields for submission/watch folders and watch grace period.
- Client settings now include first-pass add-paused support for qBittorrent, SABnzbd, Transmission, Deluge, and NZBGet, plus opt-in remove-completed and remove-failed policies; tags and recent-priority behavior remain incomplete.
- Completed, failed, and removed download terminal events are persisted to `download_history` and exposed in a separate Queue history view.
- Remote path mappings exist and are used by media import.
- Docker/NAS volume docs and root-folder health checks exist, but live multi-container validation remains shallow.

Gap:

- Sonarr/Radarr users commonly rely on rTorrent, uTorrent, Download Station, blackhole folders, and remote path mappings.

Tasks:

- Add first-party adapters for at least:
  - [x] Transmission,
  - [x] Deluge,
  - [x] NZBGet,
  - [x] torrent blackhole,
  - [x] usenet blackhole.
- Add remote path mappings with host/client/source/destination fields.
- [x] Add first-pass add-paused download-client option where supported by current built-in adapters.
- [x] Add opt-in remove-completed and remove-failed download-client policies.
- Add remaining per-client tags and priority/recent-priority refinements where supported.
- Add client-specific validation and UI fields.
- [x] Improve qBittorrent hash detection. URL grabs now fail if qBittorrent accepts the add but never exposes a concrete hash.
- [x] Track completed download history separately from active queue.

Acceptance criteria:

- Common Docker/NAS setups with separate download and media containers can import correctly.
- Removing a queue item can optionally remove files from the download client and is reflected locally.

### 7. Add True RSS Sync And Wanted/Cutoff Search Behavior

Current state:

- `IndexerService.rss` fetches RSS/recent feeds from RSS-enabled indexers through Torznab/Newznab and Cardigann adapters, records RSS stats/health, and caches candidates in `recent_releases`.
- `SchedulerLoop` job `rss_sync` fetches recent releases once and evaluates them against monitored wanted movies without active-searching every title.
- `tv_rss_sync` fetches recent releases once and evaluates them against monitored wanted aired episodes without active-searching every episode.
- `search_cutoff` and `tv_search_cutoff` now query only monitored files whose current format score is unknown or below an upgrade-enabled profile cutoff.

Gap:

- Broader parity still needs richer cutoff scheduling history/observability and any future season-pack RSS matching behavior beyond single-episode RSS evaluation.

Tasks:

- [x] Add indexer RSS/recent feed support distinct from active search.
- [x] Store recent releases with indexer/source metadata.
- [x] Match recent releases to movies/episodes before decision evaluation.
- [x] Add per-indexer RSS/search enable flags.
- [x] Add backoff and health checks for failing RSS endpoints.
- [x] Add cutoff unmet queries for movies and episodes based on profile cutoff state.

Acceptance criteria:

- RSS sync can grab a newly posted release for monitored media without active-searching the entire library.
- Search missing/cutoff jobs can be manually scheduled and observed in the UI.

### 8. Persist Operational History And Logs

Current state:

- Plex playback history is persisted.
- Release decisions are persisted.
- Structured diagnostics logs are persisted in `system_logs` and still feed the System structured-log view.
- `domain_history` persists logical audit rows for grabs, failed downloads, imports, import failures, renames, queue removals, blocklist additions, metadata refreshes, indexer/download-client health changes, notification deliveries, and settings changes.
- Activity > History has Operational and Playback views with event/media filters.
- Future plugin/custom actions still need emitters as those extension points mature.

Gap:

- Sonarr/Radarr/Prowlarr expose broad history for debugging and auditing. ARR Hub can now answer the main "what happened to this movie/episode/download?" path for implemented acquisition/import/queue/settings workflows, but future extension events still need emitters.

Tasks:

- [x] Add domain history tables for:
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
- [x] Persist structured logs or add a log-file ingestion/viewing path.
- [x] Link history rows to media, episode, release, indexer, download client, and scheduler job where possible.
- [x] Add history filters in UI.
- [x] Add settings-change history emitters.

Acceptance criteria:

- Implemented grab/import/queue/metadata/health/notification actions have history rows with timestamps and useful context.
- Logs survive process restart or are explicitly sourced from a persistent log file.

### 9. Harden Security And API Boundaries

Current state:

- Local admin login and API keys exist.
- Login now persists failed-attempt state and locks a username for a rolling window after repeated failures.
- Authenticated admins can change their password from Security settings; active sessions are revoked after a successful change.
- tRPC app procedures are authenticated after onboarding.
- Onboarding and import routers are public because they are setup flows; onboarding mutations, import execution, and import connection tests now reject after setup completion.
- There is no Sonarr/Radarr/Prowlarr-compatible REST API.

Gap:

- Replacement-grade software needs clear API boundaries, ecosystem compatibility decisions, and setup-only endpoint hardening.

Tasks:

- [x] Gate setup/import public procedures so they reject once setup is complete, including connection-test endpoints where appropriate.
- [x] Add rate limiting or lockout for login.
- [x] Add authenticated password change flow.
- Add password reset/recovery flow.
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
- Compose mounts `/data`, `/downloads`, `/movies`, and `/tv`.
- `.env.example` covers required production secrets and host media/download paths.
- README documents the current root container runtime behavior, media/download volume setup, backup/restore flow, and scheduled database backup path.
- Startup preflight checks validate the database path, app data directory permissions, migration metadata when present, and current schema shape before background jobs seed.
- System diagnostics report root folders that are missing, not directories, or not readable and writable by ARR Hub.

Gap:

- A practical Arr replacement must run on Docker/NAS hosts with stable UID/GID, media/download mounts, backup/restore behavior, and clear startup/data migration failures.

Tasks:

- [x] Add compose examples for media and downloads volumes.
- [x] Add UID/GID/PUID/PGID or documented runtime user behavior.
- [x] Add backup/restore docs.
- [x] Add scheduled backup jobs.
- [x] Add data migration checks and startup failure messages.
- [x] Add health checks for root folder accessibility and write permissions.
- [x] Add `.env.example`.

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

- In-app, generic webhook, Discord, Slack, Ntfy, Gotify, Telegram, Pushover, Apprise, Notifiarr, and custom script channels exist.
- Settings exposes editable per-channel event subscriptions and direct test-send controls.
- Event coverage now includes Plex monitoring plus operational history events for grabs, download failures, imports, import failures, renames, deletes, blocklists, metadata refreshes, indexer/download-client health changes, and settings changes.

Gap:

- Sonarr/Radarr/Prowlarr notify on grab, import, upgrade, rename, health issues, application updates, failures, manual interaction required, and more, across many providers.

Tasks:

- [x] Add event emissions for grab/import/upgrade/fail/blocklist/health/update. Implemented through operational history events for current grab, import, fail, blocklist, health, metadata, and settings workflows; explicit version-upgrade and application-update events remain future work.
- [x] Add first-pass Discord, Slack, Ntfy, Gotify, Telegram, Pushover, Apprise, Notifiarr, and custom script provider adapters using provider-specific webhook/topic/message/API/passthrough/env payloads and Settings channel selection.
- Add provider adapter for email/SMTP.
- [x] Add per-event notification settings and test-send UI.

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
- Diagnostics now also checks app data path accessibility, missing root folders, inaccessible root folders, inaccessible remote path mapping targets, all-disabled indexers/download clients, and enabled download clients that leave completed downloads in the client after import.
- Diagnostics also reports indexer search/RSS failure rollups, enabled download clients marked unavailable, and stale/missing download-client health checks.
- Indexer, Download Client, Media Server, and Media Management settings pages show filtered diagnostics items and failures for their respective integration types.

Gap:

- Sonarr/Radarr/Prowlarr have many proactive health checks.

Tasks:

- [x] Add checks for root folder missing/unwritable, all-indexers-disabled, all-download-clients-disabled, remote path missing, download client not removing completed downloads, and app data path accessibility.
- [x] Add checks for indexer search/RSS failure rollups and download client unavailable/stale health.
- Add checks for clock skew, update availability, and deeper import mechanism problems.
- [x] Show checks in System.
- [x] Show checks in relevant settings pages.

### Backup, Update, And Maintenance Jobs

Current state:

- Daily scheduler-backed SQLite database snapshots are written to `ARR_HUB_BACKUP_PATH` or a `backups` directory beside `DATABASE_PATH`.
- The System page lists database backups and supports on-demand creation, authenticated download, and restore. Restore creates a pre-restore safety backup before replacing the active SQLite database.
- Daily scheduler-backed housekeeping removes old completed scheduler jobs, notification deliveries, release decisions/blocklist rows, stale completed/failed queue rows, and expired local session tokens. Diagnostics logs are in-memory and capped.
- Update rollout is explicitly deployment-managed: ARR Hub does not self-update in-app, and source/Docker upgrade steps plus the metadata-only update channel are documented.

Gap:

- Existing Arr apps have backup, update, housekeeping, and migration operational flows.

Tasks:

- [x] Add scheduled database backups.
- [x] Add backup download/restore UI.
- [x] Add housekeeping jobs for old jobs, bounded diagnostics logs, old release decisions, stale queue, old notifications, and old sessions.
- [x] Add update status display or explicitly document container-only updates.

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

- Trusted local in-process plugins exist, with author documentation, V1 API/capability version checks, Settings contract health display, plugin lifecycle logs, and an adapter-only V1 scope decision. Cardigann indexer definitions remain in definition sources rather than plugin manifests.

Gaps:

- No sandboxing and no marketplace/distribution flow.

Tasks:

- [x] Add plugin author documentation.
- [x] Add capability version negotiation.
- [x] Add plugin health UI.
- [x] Add plugin logs UI.
- [x] Decide whether plugins can cover indexer definitions or only adapters.

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
5. Done: add persisted e2e browser smoke tests for onboarding, integration settings, add movie, add TV, manual search display, queue page.

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

1. [x] Add dedicated media file model for size/import date/media info history.
2. [x] Add import service.
3. [x] Add remote path mappings.
4. [x] Implement qBittorrent/SAB completed path resolution.
5. [x] Implement basic movie import and episode import decisions.
6. [x] Implement move/copy/hardlink and naming config.
7. [x] Add manual import UI.
8. [x] Add library rescan workflow.
9. [x] Add rename preview and rename action.
10. [x] Add target free-space checks before file transfers.

Acceptance:

- Unit coverage verifies copy, move, hardlink, sample filtering, episode matching, free-space reserve rejection, and missing output path failures.
- Deterministic unit coverage verifies remote path mappings, media file records, library scanning, and movie/series renames.
- Live qBittorrent/SAB smoke tests should download a fixture file and import it into a media root when those services are available.
- The database records real file paths and quality.

### Milestone 4: Decision Engine Hardening

Goal: reduce bad grabs and repeated failures.

Tasks:

1. [x] Add blocklist table and enforcement.
2. [x] Port high-impact decision specs first: title match, size, free space, queue conflict, protocol, retention, seeding, release restrictions.
3. [x] Add first-pass TV edge specs: full season, multi-season, split episode, same episodes, and anime absolute episode matching. Scene/XEM mapping and anime version upgrades remain explicit future parity gaps.
4. [x] Expand parser test corpus from vendor tests and fixtures.

Acceptance:

- Manual search decisions are explainable and stable.
- Blocklisting a failed queue item prevents re-grabbing the same title/infohash.
- Unit coverage verifies blocklist matching, title/year/episode mismatches, size/free-space, protocol availability, queue conflicts, age/retention, release terms, unsafe artifacts, TV edge checks, and vendor-inspired parser cases.

### Milestone 5: Prowlarr Replacement Foundation

Goal: begin the selected Option A path to replace Prowlarr directly.

Tasks:

1. [x] Decide Option A or B from P0 section 5. Option A is selected.
2. [x] Implement the curated Prowlarr replacement foundation: generic Torznab/Newznab, core Newznab presets, aggregate feeds, persisted definitions, proxy/health/stats basics, URL-backed checksum-pinned definition sources, representative Cardigann definitions, per-indexer category fan-out, and first-pass Radarr/Sonarr app sync. Broad built-in tracker definitions, full Cardigann parity, full policy parity, trusted catalogue distribution, and richer per-indexer/app-specific sync semantics are deferred.
3. [x] Update docs/UI copy to describe current Torznab/Newznab behavior without claiming replacement-grade Prowlarr support.
4. [x] After review, start with aggregate Torznab/Newznab endpoints, core Newznab presets, and a small representative definition pipeline.

Acceptance:

- Product claims match actual behavior.
- ARR Hub can move toward Prowlarr replacement without implying the current build already ships the full indexer catalogue/proxy surface.

### Milestone 6: Download Client Coverage And NAS Hardening

Goal: support common home-server deployments.

Tasks:

1. [x] Add Transmission, Deluge, NZBGet, and blackhole adapters. Transmission, Deluge, NZBGet, and blackholes are now first-pass complete with deterministic adapter coverage.
2. [x] Add Docker volume examples for `/downloads`, `/movies`, `/tv`.
3. [x] Add UID/GID or permission docs. Current runtime behavior is documented; `PUID`/`PGID` is not implemented.
4. [x] Add root folder permission health checks.
5. [ ] Validate the documented qBittorrent/SAB/Transmission Compose shape against live containers and mounted media paths.

Acceptance:

- A typical Docker Compose stack can run ARR Hub plus qBittorrent/SAB/Transmission/Deluge/NZBGet or blackhole folders and import files into mounted media paths.

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
- Prowlarr risk: maintaining indexer definitions is ongoing work, not a one-time feature; keep the bundled set curated and push long-tail and adult/XXX breadth into remote/checksum-pinned catalogues.

## Immediate Next Step For The Next Agent

Stabilize Milestone 5 around the curated replacement path. Do not continue broad tracker-by-tracker Cardigann porting in this milestone.

Recommended order:

1. Live-validate the common setup path with real credentials: NZBGeek, DrunkenSlug, NZBFinder, one optional Newznab preset, and at least one Torznab or representative torrent source.
2. Use URL-backed checksum-pinned definition sources for long-tail and adult/XXX trackers instead of adding more built-ins.
3. Move to Milestone 6 once the common indexer path is verified, or explicitly document that live provider validation remains an environment-gated release task.
