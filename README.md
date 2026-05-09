# ARR Hub

ARR Hub is a unified, self-hosted media automation app inspired by the arr ecosystem, built as a single application with shared policy/scheduler/runtime modules.

## Current Focus

- Adapter-driven integrations (download clients, indexers, media servers)
- Shared release policy engine + scheduler pipelines
- Operator UI for onboarding, settings, profiles, movies, TV, manual search, scheduler, and queue actions
- Prowlarr replacement foundation; current indexer support consumes Torznab/Newznab upstreams, seeds generic/Cardigann-style definitions, refreshes URL-backed Cardigann sources, exposes first-pass aggregate feeds, and can sync aggregate indexers into Radarr/Sonarr

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
export ENCRYPTION_KEY="$(openssl rand -base64 32)"
export INITIAL_ADMIN_PASSWORD="change-me-before-first-login"
docker compose up -d --build
```

The compose file publishes `http://localhost:3000`, stores SQLite data in the
`arr-hub-data` volume, runs Drizzle migrations before the server starts, and
checks `/api/system/health` for container health.

Native modules such as `better-sqlite3` are installed and built inside the Linux
container image. Do not bind-mount host `node_modules` into the container.

## Environment

### Required in production

- `ENCRYPTION_KEY`
- `INITIAL_ADMIN_PASSWORD` (for first-run bootstrap only, when no users exist)

### Optional

- `DATABASE_PATH` (default: `data/arr-hub.db`)
- `PORT` (default: `3000`)

### Development defaults

- If `ENCRYPTION_KEY` is missing outside production, a dev-only fallback key is used.
- If `INITIAL_ADMIN_PASSWORD` is missing outside production and no users exist, default admin password is `admin`.

## Auth + UI Session

1. Open **Settings → Security**.
2. Sign in with local admin credentials.
3. Session token is stored locally and used automatically for tRPC requests.

## Available UI Validation Surfaces

- **Settings → Indexers**: list/add/test Torznab/Newznab upstream endpoints
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

- Generic first-party Torznab/Newznab and small curated Cardigann-style YAML definition records are seeded at startup.
- Indexer records can carry definition keys, tags, search/RSS enable flags, and optional proxy links; Cardigann-style definitions now have first-pass GET/XML search execution.
- HTTP/SOCKS/FlareSolverr proxy configuration is persisted and applied to outbound Torznab/Newznab requests; indexer search statistics, first-pass search health/backoff state, and version-aware built-in definition refresh are persisted.
- URL-backed Cardigann definition source records can fetch remote YAML, persist the raw source, and make refreshed definitions available to definition-keyed indexers.
- External clients can query aggregate XML feeds with an ARR Hub API key:
  - `/api/indexers/aggregate/torznab?t=caps&apikey=...`
  - `/api/indexers/aggregate/newznab?t=search&q=example&apikey=...`
- Radarr/Sonarr application records can persist encrypted remote credentials and sync aggregate Torznab/Newznab indexers into `/api/v3/indexer`; the synced app payload uses a reachable ARR Hub URL plus ARR Hub API key.

This is not yet a Prowlarr-scale catalogue. The Cardigann/YAML loader currently
supports curated fixtures plus manually configured URL-backed YAML sources; broad
tracker coverage, full Cardigann selector/login parity, mature per-indexer policy
controls, scheduled/trusted remote definition catalogues, and full Prowlarr
app-sync parity remain planned work. Search failures now mark indexers unhealthy,
short-backoff retryable failures, and disable indexers on authentication failures.

## Current Limitations

ARR Hub is not yet a full Sonarr/Radarr/Prowlarr replacement. TV metadata,
completed-download imports, release decisions, and operator workflows have
working first-pass implementations, but they still lack the full depth of the
mature Arr apps. Prowlarr replacement is underway, but ARR Hub still does not
ship a broad tracker catalogue, full Cardigann request runtime, or scheduled
remote definition catalogue/trust pipeline.

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

## Upgrades

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
