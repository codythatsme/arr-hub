# ARR Hub

ARR Hub is a unified, self-hosted media automation app inspired by the arr ecosystem, built as a single application with shared policy/scheduler/runtime modules.

## Current Focus

- Adapter-driven integrations (download clients, indexers, media servers)
- Download client adapters for qBittorrent, SABnzbd, first-pass Transmission, first-pass Deluge, first-pass NZBGet, and first-pass torrent/usenet blackhole folders
- Shared release policy engine + scheduler pipelines
- Operator UI for onboarding, settings, profiles, movies, TV, manual search, scheduler, and queue actions
- Prowlarr replacement foundation for common setups: generic Torznab/Newznab, curated Newznab presets for NZBGeek, DrunkenSlug, NZBFinder, NinjaCentral, NZBPlanet, and altHUB, representative torrent/Cardigann definitions, aggregate Torznab/Newznab feeds, proxy/health/stats basics, checksum-pinned remote definition sources, and first-pass Radarr/Sonarr app sync.

See [development-plan.md](./development-plan.md) for detailed replacement-readiness status.

## Tech Stack

- Bun + TypeScript
- TanStack Start + TanStack Router + TanStack Query
- tRPC
- Effect (service architecture + typed errors)
- Drizzle ORM + SQLite

## Quick Start

```bash
bun install
bun run dev
```

App runs at `http://localhost:3000`.

## Docker Deployment

ARR Hub ships a first-party container path for NAS and home-server deployments.

```bash
cp .env.example .env
# Edit .env and set ENCRYPTION_KEY plus INITIAL_ADMIN_PASSWORD before first start.
docker compose up -d --build
```

The compose file publishes `http://localhost:3000`, stores SQLite data in the
`arr-hub-data` volume, mounts `/downloads`, `/movies`, and `/tv` from host paths,
runs Drizzle migrations before the server starts, and checks
`/api/system/health` for container health.

Native modules such as `better-sqlite3` are installed and built inside the Linux
container image. Do not bind-mount host `node_modules` into the container.

### Docker storage and permissions

`compose.yml` uses these container paths by default:

- `/data` for ARR Hub SQLite data and encrypted credentials.
- `/downloads` for completed download paths visible to ARR Hub.
- `/movies` for movie imports.
- `/tv` for TV imports.

Set `ARR_HUB_DOWNLOADS_PATH`, `ARR_HUB_MOVIES_PATH`, and `ARR_HUB_TV_PATH` in
`.env` to the matching host or NAS paths. In onboarding or
**Settings → Media Management**, use `/movies` and `/tv` as ARR Hub root
folders. Configure download clients to report completed files under
`/downloads`, or add a remote path mapping when the client reports a different
container path.

The current image does not implement `PUID`/`PGID`; the runtime stage does not
set `USER`, so it currently runs as root inside the container. On Linux/NAS
hosts, create the bind mount directories first and grant the container read,
write, and directory traverse access. The **System** health view reports
configured root folders that are missing, not directories, or not readable and
writable by ARR Hub.

### Backup and restore

Keep `ENCRYPTION_KEY` stable across backups and restores. Without the original
key, encrypted integration credentials cannot be decrypted.

ARR Hub also runs a daily scheduler-backed SQLite backup job. It writes online
database snapshots and JSON manifests to `ARR_HUB_BACKUP_PATH`; when unset, the
default is a `backups` directory beside `DATABASE_PATH` such as `/data/backups`
in the Compose container.

```bash
mkdir -p backups/arr-hub-data
docker compose stop arr-hub
docker compose cp arr-hub:/data/. ./backups/arr-hub-data
docker compose start arr-hub
```

Restore by stopping the container, copying the saved data directory back into
`/data`, and starting the container again:

```bash
docker compose stop arr-hub
docker compose cp ./backups/arr-hub-data/. arr-hub:/data/
docker compose start arr-hub
```

## Environment

### Required in production

- `ENCRYPTION_KEY`
- `INITIAL_ADMIN_PASSWORD` (for first-run bootstrap only, when no users exist)

### Optional

- `DATABASE_PATH` (default: `data/arr-hub.db`)
- `ARR_HUB_BACKUP_PATH` (default: `backups` beside `DATABASE_PATH`)
- `PORT` (default: `3000`)
- `ARR_HUB_DOWNLOADS_PATH` (Compose host path mounted at `/downloads`)
- `ARR_HUB_MOVIES_PATH` (Compose host path mounted at `/movies`)
- `ARR_HUB_TV_PATH` (Compose host path mounted at `/tv`)

### Development defaults

- If `ENCRYPTION_KEY` is missing outside production, a dev-only fallback key is used.
- If `INITIAL_ADMIN_PASSWORD` is missing outside production and no users exist, default admin password is `admin`.

## Auth + UI Session

1. Open **Settings → Security**.
2. Sign in with local admin credentials.
3. Session token is stored locally and used automatically for tRPC requests.

## Available UI Validation Surfaces

- **Settings → Indexers**: list/add/test Torznab/Newznab upstream endpoints, first-pass Cardigann definition config/auth fields including select options/defaults and checkbox controls, tags, search/RSS toggles, HTTP/SOCKS/FlareSolverr proxy controls, indexer stats, built-in definition refresh, definition source refresh/checksum-required catalog import controls, and Radarr/Sonarr application sync controls including Sonarr anime category filters
- **Settings → Download Clients**: list/add/test download clients
- **Settings → Media Servers**: list/add/test media servers
- **Settings → Scheduler**: inspect jobs, pause/resume, run jobs, retry failures
- **Settings → General**: update app name and release channel settings
- **Settings → Media Management**: update naming/file-handling settings and root folders
- **Settings → Profiles**: create/edit/delete quality profiles and apply starter bundles
- **Settings → Security**: login + API key list/create/revoke
- **Movies**: add/list/evaluate/search+grab/manual grab
- **TV Shows**: manual add/list/edit/monitor/search+grab flows using local series data
- **Activity → Queue**: live queue polling, retry, remove, delete-files, and clear-error actions

## Prowlarr Replacement Decision

ARR Hub has selected Option A: replace Prowlarr directly instead of requiring
users to keep Prowlarr installed upstream.

Current foundation:

- Generic first-party Torznab/Newznab, curated Newznab presets for NZBGeek, DrunkenSlug, NZBFinder, NinjaCentral, NZBPlanet, and altHUB, and representative Cardigann-style YAML definition records are seeded at startup.
- Core curated built-ins are the common Newznab presets above plus generic Newznab/Torznab and representative Cardigann fixtures such as Nyaa. Broad public, private, and adult torrent tracker coverage should come through generic Torznab, checksum-pinned remote definitions, or separate catalogue PRs unless a specific source is explicitly promoted into the curated set.
- Indexer records can carry definition keys, encrypted definition-specific config/auth values, tags, search/RSS enable flags, minimum-seeder filters, query cooldowns, rolling query/grab limits, category restrictions, and optional proxy links; Settings can render first-pass definition-specific config/auth inputs, including select options/defaults and checkbox controls, without exposing saved secret values, edit tags plus search/RSS flags, and assign an outbound proxy, and Cardigann-style definitions now have first-pass GET/POST XML search execution with request template filters including `querystring`, `split`, URL decode aliases, and HTML entity filters, search keyword filters including `querystring`, `split`, URL alias/escape filters, and HTML entity filters, range template expansion, base template variables (`.Config.sitelink`, `.True`, `.False`, `.Today.Year`), conditional/function helpers (`if`, `and`, `or`, `eq`, `ne`, `join`, `re_replace`), checkbox config booleans, auth-default config rendering, scalar and list-valued templated request headers, single-object search paths, scalar static request input/category normalization, `caps.categories` dictionary parsing against the standard Newznab category tree, multi-Newznab category mapping expansion, default category fallback, path-scoped category narrowing, path-level inherited input controls, first-pass HTML row/field selector result parsing with simple descendant selector scoping, `rows.after` merging, field descendant removal, selector case mappings, and field selector self-matching, and first-pass login request execution with pre-seeded login cookies, direct cookie-login rendering, one-url login requests, form login requests, multipart form login submissions, selector-derived form login values, login error selectors, login test selectors, and session-cookie reuse; search fan-out honors per-indexer category restrictions, aggregate Torznab/Newznab requests forward offset/extended metadata into upstream adapters and Cardigann templates, caps parsing normalizes Newznab/Torznab search-type names and nested categories, and aggregate feeds emit response/enclosure metadata for Sonarr/Radarr-style clients.
- HTTP/SOCKS/FlareSolverr proxy configuration is persisted, editable in Settings without exposing saved proxy secrets, and applied to outbound Torznab/Newznab requests; indexer search statistics are visible in Settings, and first-pass search health/backoff state plus version-aware built-in definition refresh are persisted and refreshable from Settings.
- URL-backed Cardigann definition source records are manageable from Settings, can fetch remote YAML, persist the raw source, record SHA-256 provenance with optional checksum pinning, import JSON catalog manifests only when the manifest SHA-256 pin matches and each entry carries a source SHA-256 pin, make refreshed definitions available to definition-keyed indexers, and refresh enabled sources from the scheduler.
- External clients can query aggregate XML feeds with an ARR Hub API key:
  - `/api/indexers/aggregate/torznab?t=caps&apikey=...`
  - `/api/indexers/aggregate/newznab?t=search&q=example&apikey=...`
- Radarr/Sonarr application records are manageable from Settings, can persist encrypted remote credentials, and can sync aggregate Torznab/Newznab indexers into `/api/v3/indexer`; enabled apps can be refreshed from the scheduler and after indexer add/update/remove mutations, full sync removes stale remote aggregate indexers when protocols no longer have eligible local indexers while add-only sync preserves existing remote mappings, Sonarr sync separates standard and anime category fields, updates retain existing app-side tags, download client assignment, and non-managed fields, and the synced app payload uses a reachable ARR Hub URL plus ARR Hub API key, app priority, and first-pass torrent seed criteria.

This is intentionally not a Prowlarr-scale bundled catalogue. The built-in set is
curated for common NZB-heavy setups and a representative torrent path; broad
tracker breadth is deferred to checksum-pinned remote definition sources or a
later catalogue-maintenance milestone. Search failures now mark indexers
unhealthy, short-backoff retryable failures, and disable indexers on
authentication failures.

## Current Limitations

ARR Hub is not yet a full Sonarr/Radarr/Prowlarr replacement. TV metadata,
completed-download imports, release decisions, and operator workflows have
working first-pass implementations, but they still lack the full depth of the
mature Arr apps. Download client coverage is still limited to qBittorrent,
SABnzbd, first-pass Transmission, first-pass Deluge, first-pass NZBGet, and
first-pass torrent/usenet blackholes. Prowlarr replacement is underway, but
ARR Hub still does not ship a broad tracker catalogue, full Cardigann selector/login runtime beyond first-pass HTML selector/case features and cookie/one-url/form login execution with multipart forms, selector-derived form values, and login test selectors, richer definition auth UX, or trusted
remote definition catalogue pipeline beyond checksum-pinned sources and
checksum-required catalog manifest import.

## API Compatibility

ARR Hub does not currently expose Sonarr, Radarr, or Prowlarr compatible REST
APIs. The web app uses internal tRPC procedures plus a small set of HTTP
surfaces including `/api/system/health` and aggregate Torznab/Newznab-compatible
indexer feeds. Existing Arr ecosystem tools should not treat ARR Hub as a
drop-in compatible Sonarr/Radarr/Prowlarr server yet.

## Scripts

```bash
bun run dev
bun run build
bun run preview
bun run test
bun run typecheck
bun run lint
bun run fmt:check
bun run test:e2e
bun run test:live-adapters
bun run test:live-adapters:docker
```

`test:e2e` runs a Playwright Chromium smoke test against an ephemeral SQLite
database with deterministic metadata fixtures.

`test:live-adapters` is an opt-in interop check against real services. Tests
are skipped unless their matching environment variables are set:

- qBittorrent: `ARR_HUB_LIVE_QBIT_HOST`, optional `ARR_HUB_LIVE_QBIT_PORT`,
  `ARR_HUB_LIVE_QBIT_USERNAME`, `ARR_HUB_LIVE_QBIT_PASSWORD`,
  `ARR_HUB_LIVE_QBIT_SSL`, `ARR_HUB_LIVE_QBIT_CATEGORY`
- SABnzbd: `ARR_HUB_LIVE_SAB_HOST`, `ARR_HUB_LIVE_SAB_API_KEY`, optional
  `ARR_HUB_LIVE_SAB_PORT`, `ARR_HUB_LIVE_SAB_SSL`,
  `ARR_HUB_LIVE_SAB_CATEGORY`
- Torznab/Newznab: `ARR_HUB_LIVE_TORZNAB_URL`,
  `ARR_HUB_LIVE_TORZNAB_API_KEY`, optional
  `ARR_HUB_LIVE_TORZNAB_PROTOCOL`, `ARR_HUB_LIVE_TORZNAB_PRIORITY`. For
  Prowlarr aggregate caps, use the `/0` Torznab base URL, for example
  `http://localhost:9696/0`.
- Plex: `ARR_HUB_LIVE_PLEX_HOST`, `ARR_HUB_LIVE_PLEX_TOKEN`, optional
  `ARR_HUB_LIVE_PLEX_PORT`, `ARR_HUB_LIVE_PLEX_SSL`. Plex live validation
  requires a claimed Plex Media Server and a real server token; a fresh
  unclaimed container returns `401 Unauthorized` for the root server endpoint.

The default unit suite uses deterministic protocol fixtures; run the live suite
before claiming interoperability with a specific service version or deployment.
`test:live-adapters:docker` starts temporary qBittorrent, SABnzbd, and Prowlarr
containers, runs the matching live adapter checks, and stops/removes the
temporary resources. Plex is still opt-in through the `ARR_HUB_LIVE_PLEX_*`
variables because a claimed server token is required.

## Database

- Drizzle schema: `src/db/schema.ts`
- Migration config: `drizzle.config.ts`
- Container database path: `/data/arr-hub.db`
- Startup validates the database file, app data directory permissions, migration
  metadata when present, and a current schema shape before seeding background
  jobs. If validation fails, the startup log includes the database path and the
  migration command to run.
- The scheduler runs daily housekeeping for old completed jobs, notification
  deliveries, release decisions/blocklist rows, stale completed queue rows, and
  expired local session tokens.

## Upgrades

ARR Hub does not perform in-app self-updates. Version rollout is owned by the
deployment method: update the source checkout or container image, run database
migrations, and restart the process/container.

For source installs, pull the new version, reinstall dependencies if the lockfile
changed, run migrations, then restart:

```bash
bun install --frozen-lockfile
bun run db:migrate
bun run build
```

For Docker installs:

```bash
docker compose pull
docker compose up -d --build
```

The Settings update channel is persisted for operator metadata only; it does not
download or install releases from inside the running app.

Setup state is stored in SQLite, so upgrading does not require repeating
onboarding. Keep the data volume and `ENCRYPTION_KEY` stable across upgrades or
encrypted integration credentials cannot be decrypted.

## Unsupported Boundaries

ARR Hub V1 is intentionally local-first and single-admin. It does not provide
multi-user RBAC, cloud sync, hosted remote access, mobile apps, payments, public
plugin marketplace distribution, or automatic media file repair. Jellyfin support
is experimental through the adapter layer; Plex is the first-class V1 media
server target.

## Architecture Notes

- Integrations are resolved via `AdapterRegistry` (download/indexer/media server).
- Core services are Effect `Context.Tag`s provided via Layers (`src/effect/layers.ts`).
- tRPC procedures bridge through `runEffect()` (`src/integrations/trpc/init.ts`).
