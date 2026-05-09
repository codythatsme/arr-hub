# PRD Gap Report: Issue 1 ARR Hub V1

Date: 2026-05-04
Branch audited: `main`
PRD source: GitHub issue 1, "PRD: ARR Hub unified self-hosted media automation"

## Objective And Success Criteria

Objective: compare issue 1 to the current `main` branch and determine whether ARR Hub has shipped all PRD functionality.

Success criteria used for this audit:

- Every V1 user story in issue 1 has a shipped backend/API/UI path or is explicitly out of scope.
- Every named implementation module exists and is wired into the runtime.
- Required data model, API, onboarding, integration, scheduler, plugin, security, diagnostics, Plex activity, and deployment surfaces are present.
- Tests/build/typecheck/lint provide meaningful coverage for the required behavior.
- Any missing, partial, or weakly verified requirement is listed as a gap.

## Verdict

ARR Hub has shipped a substantial V1 foundation, but issue 1 is **not fully shipped**.

The core architecture is present: Effect services, Drizzle schema, tRPC routers, Movies/TV CRUD and acquisition, release policy, scheduler, built-in adapters, plugin loader, auth/API keys, Radarr/Sonarr import, queue/activity, diagnostics, and Plex activity analytics are all represented in first-party code.

Open gaps remain in Docker-first deployment, user-facing notification delivery/configuration, full onboarding integration validation, capability-pack depth, day-2 update/migration UX, unsupported-boundary documentation, and some UI completeness around effective profiles and Plex watched status on media detail pages.

## Verification Run

- `git status --short --branch`: `## main...origin/main`
- `gh issue view 1 --json title,body,state,labels,url`: issue 1 is open and contains the PRD used for this checklist.
- `bun run typecheck`: passed.
- `bun run test`: passed, 26 files / 270 tests.
- `bun run lint`: passed with 0 errors and 64 warnings.
- `bun run build`: passed. Build emitted chunk-size and external dependency warnings, but no build failure.
- Docker artifact search: no first-party `Dockerfile`, `compose.yml`, `compose.yaml`, or `docker-compose.yml` found outside `vendor/`.

## Requirement Checklist

| PRD Requirement                                                   | Status            | Evidence                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single self-hosted app, local-only operation                      | Mostly shipped    | App is a local TanStack/tRPC/SQLite app; required prod env is local `ENCRYPTION_KEY` and `INITIAL_ADMIN_PASSWORD` in `README.md`. No cloud dependency found in runtime wiring.                                                                                                                       |
| Docker-first NAS/home-server deployment                           | Gap               | No first-party Docker/compose artifact exists outside `vendor/`.                                                                                                                                                                                                                                     |
| Movies and TV management in one app                               | Shipped           | Schema has `movies`, `series`, `seasons`, `episodes`; services and routes exist for Movies/TV. See `src/db/schema.ts:111`, `src/db/schema.ts:134`, `src/routes/movies/index.tsx`, `src/routes/tv/index.tsx`.                                                                                         |
| Basic indexer management                                          | Shipped           | `indexers` and `indexer_health` schema plus Torznab/Newznab adapters and router. See `src/db/schema.ts:207`, `src/effect/services/AdapterRegistry.ts:168`.                                                                                                                                           |
| qBittorrent and SABnzbd integrations                              | Shipped           | Both built-in download adapters registered. See `src/effect/services/AdapterRegistry.ts:166`.                                                                                                                                                                                                        |
| Plex integration                                                  | Mostly shipped    | Plex media server adapter is registered and active sessions are exposed over tRPC. See `src/effect/services/AdapterRegistry.ts:170`, `src/integrations/trpc/routers/mediaServers.ts:134`.                                                                                                            |
| Single local admin auth and app API keys                          | Shipped           | `users` and `api_keys` schema, `AuthService`, security route, and tests exist. See `src/db/schema.ts:14`, `src/db/schema.ts:26`.                                                                                                                                                                     |
| Secrets stored securely and edited safely                         | Mostly shipped    | Credentials are encrypted in schema fields and AES-GCM crypto exists. See `src/db/schema.ts:212`, `src/db/schema.ts:253`, `src/db/schema.ts:319`, `src/effect/services/CryptoService.ts:70`. Still needs UI/log redaction audit beyond tests.                                                        |
| Local folder plugin architecture                                  | Shipped           | Plugin schema and loader scan local folders, validate manifest/contract, register/unregister adapters. See `src/db/schema.ts:431`, `src/effect/services/PluginLoader.ts:69`, `src/effect/services/PluginLoader.ts:433`.                                                                              |
| Stable adapter contracts                                          | Mostly shipped    | Registry and plugin validation enforce method surfaces. See `src/effect/services/PluginLoader.ts:161`, `src/effect/services/PluginLoader.ts:205`, `src/effect/services/PluginLoader.ts:235`. Contract docs for authors are not evident.                                                              |
| Plugin enable/disable controls                                    | Shipped           | Plugin loader has `enable`, `disable`, `remove`, `health`; settings route exists. See `src/effect/services/PluginLoader.ts:76`.                                                                                                                                                                      |
| One-click quickstart                                              | Partially shipped | Quickstart creates admin, seeds profile defaults, optionally stores root folders, and marks all setup steps complete. It does not configure/test indexer/download/Plex integrations despite the PRD saying quickstart enables core integrations. See `src/effect/services/OnboardingService.ts:264`. |
| Advanced guided wizard                                            | Partially shipped | Wizard state and UI exist with steps, but onboarding service only persists admin/capabilities/profiles/root folders and skip/back/complete; integration validation is not part of `OnboardingService`. See `src/effect/services/OnboardingService.ts:84`.                                            |
| Radarr/Sonarr one-time import during setup                        | Mostly shipped    | Import service tests connections and bulk inserts movies/series/seasons, scoped to active setup. See `src/effect/services/ImportService.ts:34`, `src/effect/services/ImportService.ts:184`, `src/effect/services/ImportService.ts:216`. Episode import from Sonarr is not evident.                   |
| TRaSH-inspired defaults, versioned/updatable                      | Mostly shipped    | Two hardcoded TRaSH-inspired bundles with scoring, negative formats, version, and bundle snapshots exist. See `src/effect/domain/bundles.ts:120`, `src/effect/domain/bundles.ts:149`. Coverage is narrow compared with full TRaSH guidance.                                                          |
| Release ranking explainability                                    | Shipped           | Decisions include stage/rule/detail reasons and are persisted. See `src/effect/services/ReleasePolicyEngine.ts:164`, `src/effect/services/ReleasePolicyEngine.ts:449`.                                                                                                                               |
| Unwanted release rejection defaults                               | Shipped           | Bundle includes negative `BR-DISK`/`LQ` scores and policy rejects below minimum score. See `src/effect/domain/bundles.ts:140`, `src/effect/services/ReleasePolicyEngine.ts:243`.                                                                                                                     |
| Safe upgrade logic                                                | Shipped           | Policy checks upgrades enabled, downgrades, cutoff, and minimum upgrade score. See `src/effect/services/ReleasePolicyEngine.ts:268`.                                                                                                                                                                 |
| Unified queue/activity view                                       | Shipped           | Queue schema, service/tests, tRPC, and `/activity/queue` route exist. See `src/db/schema.ts:286`, `src/routes/activity/queue.tsx`.                                                                                                                                                                   |
| Robust retry/backoff and idempotent scheduler actions             | Mostly shipped    | Scheduler stores dedupe keys, attempts, retry delay/backoff, dead state, pause/resume. See `src/effect/services/SchedulerService.ts:84`, `src/effect/services/SchedulerService.ts:181`. End-to-end idempotency beyond scheduler enqueue is partly covered by tests.                                  |
| Integration health indicators                                     | Shipped           | Per-integration health tables and diagnostics aggregation exist. See `src/db/schema.ts:230`, `src/db/schema.ts:270`, `src/db/schema.ts:334`.                                                                                                                                                         |
| Settings grouped logically by workflow                            | Shipped           | Settings routes cover general, media management, profiles, indexers, download clients, media servers, notifications, scheduler, security, plugins.                                                                                                                                                   |
| Logging and diagnostics                                           | Mostly shipped    | Diagnostics status/health/tasks/log APIs exist. Logs are in-memory, not persistent, and there is no broad log redaction audit.                                                                                                                                                                       |
| Deterministic scheduler behavior                                  | Mostly shipped    | Claiming uses oldest pending job and status transition guard. See `src/effect/services/SchedulerService.ts:133`.                                                                                                                                                                                     |
| Inspect effective profile values                                  | Partially shipped | Defaults engine has preview/effective APIs, profile settings UI exists, but the audit did not find a strong user-facing effective defaults+overrides inspection workflow.                                                                                                                            |
| Upgrade ARR Hub without redoing setup                             | Partially shipped | Drizzle migrations and setup state exist, but no explicit product update flow or upgrade docs were found.                                                                                                                                                                                            |
| Explicit unsupported boundaries                                   | Gap               | PRD out-of-scope boundaries are not documented in `README.md` or a shipped product surface.                                                                                                                                                                                                          |
| Extensible toward future requests/users                           | Mostly shipped    | Single-admin auth, plugin architecture, adapter interfaces, and shared Effect services provide a reasonable foundation.                                                                                                                                                                              |
| Plex active streams, quality, bandwidth                           | Mostly shipped    | `PlexSessionMonitor` tracks active sessions and router exposes them. See `src/effect/services/PlexSessionMonitor.ts:58`, `src/integrations/trpc/routers/mediaServers.ts:134`.                                                                                                                        |
| Plex playback history with filters                                | Shipped           | `SessionHistoryService.listHistory` supports user/media/server/date filters. See `src/effect/services/SessionHistoryService.ts`.                                                                                                                                                                     |
| Per-user Plex watch statistics                                    | Shipped           | `PlexUserService.getUserStats` and routes exist.                                                                                                                                                                                                                                                     |
| Plex charts for play counts, watch time, stream type distribution | Shipped           | `StatsService` exposes daily plays, watch time, stream types, top media/users, hour-of-day; `/activity/stats` route exists.                                                                                                                                                                          |
| Notifications for stream start/stop, new content, server offline  | Gap               | Monitoring trigger bus emits events, but there is no channel configuration or delivery service; notifications settings page is only static copy. See `src/effect/services/MonitoringTriggerBus.ts:6`, `src/routes/settings/notifications.tsx:7`.                                                     |
| Watched status on movie/series detail pages                       | Partially shipped | History links rows to `movieId`/`episodeId`, but only list pages were found for Movies/TV; no clear media detail page surface showing watched-by whom. See `src/db/schema.ts:423`.                                                                                                                   |

## Named Implementation Modules

| Named Module                | Status                                               | Evidence                                                                                                                                |
| --------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `OnboardingOrchestrator`    | Implemented as `OnboardingService`, partial behavior | `src/effect/services/OnboardingService.ts:84`                                                                                           |
| `ProfileDefaultsEngine`     | Shipped                                              | `src/effect/services/ProfileDefaultsEngine.ts` and bundles in `src/effect/domain/bundles.ts`                                            |
| `ReleasePolicyEngine`       | Shipped                                              | `src/effect/services/ReleasePolicyEngine.ts:99`                                                                                         |
| `AcquisitionScheduler`      | Implemented as `SchedulerService` plus loop/pipeline | `src/effect/services/SchedulerService.ts:25`                                                                                            |
| `AdapterRuntime`            | Implemented as `AdapterRegistry` plus `PluginLoader` | `src/effect/services/AdapterRegistry.ts:47`, `src/effect/services/PluginLoader.ts:69`                                                   |
| `MoviesModule` / `TvModule` | Implemented as services/routes                       | `src/effect/services/MovieService.ts`, `src/effect/services/SeriesService.ts`, `src/routes/movies/index.tsx`, `src/routes/tv/index.tsx` |

## Schema Coverage

The PRD schema replacement is broadly covered:

- Media items and watch state: `movies`, `series`, `seasons`, `episodes`, `session_history`.
- Profiles/scoring: `quality_profiles`, `quality_items`, `custom_formats`, `custom_format_specs`, `custom_format_scores`.
- Indexers: `indexers`, `indexer_health`.
- Integrations and encrypted credential references: `download_clients`, `media_servers`, encrypted fields.
- Scheduler: `scheduler_config`, `scheduler_jobs`.
- Release decision rationale: `release_decisions`.
- Plugins: `plugins`.
- Setup state: `setup_state`, `setup_log`.

Notable schema gaps: no notification channel/subscription table, no explicit update/upgrade state table, and no first-party deployment metadata.

## API Coverage

The root tRPC router exposes cohesive routers for auth, onboarding, movies, series, profiles, settings, formats, indexers, download clients, media servers, Plex users, plugins, history, import, releases, queue, root folders, scheduler, stats, diagnostics, and TMDB.

Missing or weak APIs:

- Notification channel CRUD and delivery state.
- Explicit unsupported-boundary/product capability API.
- A complete onboarding activation API that validates indexer/download/Plex configuration before final setup completion.
- Media detail watched-by endpoint may exist indirectly through `history.getForMedia`, but matching detail pages were not found.

## Test Coverage

Evidence: 26 test files / 270 tests passed.

Covered modules include bootstrap, auth, crypto, config, settings, movies, series, profiles/defaults, release policy, title parser, indexers, media servers, adapter registry, plugin loader, scheduler, acquisition pipeline, queue, download monitor, diagnostics, Plex session monitor, Plex users, session history, stats, and tRPC init/integration.

Coverage gaps:

- No clear tests for Docker/container deployment.
- No notification delivery tests because no delivery implementation exists.
- Onboarding tests were not found in the first-party test list.
- UI workflows are not covered by browser/e2e tests in this audit.
- Integration tests use mocks; real qBittorrent/SABnzbd/Plex/Torznab interop remains unverified.

## Prioritized Gaps

1. Add first-party Docker deployment artifacts and docs: `Dockerfile`, compose example, volume/env guidance, startup/migration command, healthcheck, and native-module architecture notes for `better-sqlite3`.
2. Implement notifications end to end: channel schema/settings, delivery worker/subscribers for `MonitoringTriggerBus`, tests for stream start/stop/new content/server down, and UI configuration.
3. Finish onboarding V1 contract: quickstart should either actually enable/test core integrations or the PRD should be revised; advanced wizard should validate integrations through onboarding service before activation.
4. Add onboarding tests covering quickstart, wizard ordering, rollback/back behavior, defaults, setup state, and import flow.
5. Add explicit unsupported-boundaries documentation/product surface matching PRD out-of-scope decisions.
6. Add/verify media detail pages showing Plex watched status and watched-by whom for movies/series/episodes.
7. Improve effective profile inspection in UI so operators can see defaults plus overrides, not only backend previews.
8. Add update/upgrade docs and any needed migration guardrails so setup is not redone after upgrades.
9. Expand real integration validation beyond mocks for qBittorrent, SABnzbd, Plex, and at least one indexer protocol.
10. Decide whether Jellyfin support is intentional V1 scope expansion; it is registered even though the PRD names Plex as first-class.

## Completion Audit Result

The objective was achieved for this turn: issue 1 was reviewed against current `main`, evidence was inspected from code/schema/routes/tests/config, verification commands were run, and gaps are documented above.

The product objective in issue 1 is not complete: the shipped app still has the gaps listed in this report.

## Implementation Follow-Up

Date: 2026-05-04

The prioritized gaps above have been implemented or materially advanced in this
workspace. Current evidence:

- Docker deployment: added `Dockerfile`, `.dockerignore`, `compose.yml`, public
  `/api/system/health`, Docker README guidance, native `better-sqlite3` rebuild
  handling, and migration-at-startup. Verified with
  `docker build -t arr-hub:prd-gap-check .` and a healthy smoke-test container.
- Notifications: added notification channel and delivery schema, service,
  tRPC router, settings UI, runtime wiring, and service tests.
- Onboarding: quickstart can validate and store optional indexer, download
  client, and Plex integration settings before setup activation; the advanced
  wizard validates integration steps through `OnboardingService` before
  advancing. Added onboarding tests for quickstart, invalid integration
  rollback, wizard ordering/back/complete behavior, and setup state.
- Unsupported boundaries and upgrades: documented in `README.md`.
- Watched status on detail pages: added movie and series detail routes plus
  `SessionHistoryService.getHistoryForSeries` and matching tRPC/history tests.
- Effective profile inspection: replaced the profile settings page with an
  effective preview workflow for bundles and profiles.
- Live adapter validation: added deterministic built-in protocol tests,
  opt-in `bun run test:live-adapters`, and repeatable
  `bun run test:live-adapters:docker` smoke validation. The Docker smoke command
  starts temporary qBittorrent, SABnzbd, and Prowlarr containers, runs the live
  adapter checks, and stops/removes temporary resources.
- Jellyfin scope: documented as experimental through the adapter layer, with
  Plex as the first-class V1 media server target.

Current verification:

- `bun run fmt`: passed.
- `bun run fmt:check`: passed.
- `bun run typecheck`: passed.
- `bun run lint`: passed with 0 errors and existing warnings.
- `bun run test`: passed with 284 tests and 4 skipped live-adapter tests.
- `bun run build`: passed.
- `bun run test:live-adapters:docker`: passed for SABnzbd, qBittorrent, and
  Prowlarr/Torznab; Plex skipped because no live Plex variables were set.
- `docker build -t arr-hub:prd-gap-check .`: passed.
- ARR Hub Docker smoke container healthcheck: `healthy`.

Remaining blocker:

- Live Plex validation still requires a claimed Plex Media Server and real token
  supplied through `ARR_HUB_LIVE_PLEX_HOST` and `ARR_HUB_LIVE_PLEX_TOKEN`. A
  fresh unclaimed Plex container was tested and returns `401 Unauthorized` for
  the root endpoint required by `createPlexAdapter().testConnection()`, and it
  does not generate `PlexOnlineToken` locally. The Plex adapter should not be
  weakened to accept an unclaimed server as a successful V1 interop check.
