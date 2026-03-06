# ARR Hub

ARR Hub is a unified, self-hosted media automation app inspired by the arr ecosystem, built as a single application with shared policy/scheduler/runtime modules.

## Current Focus

- Adapter-driven integrations (download clients, indexers, media servers)
- Shared release policy engine + scheduler pipelines
- Functional operator UI slice for integrations, movies, security, and queue validation

See [ISSUE_VALIDATION_PLAN_2026-03-06.md](./ISSUE_VALIDATION_PLAN_2026-03-06.md) for detailed roadmap status.

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

- **Settings → Indexers**: list/add/test indexers
- **Settings → Download Clients**: list/add/test download clients
- **Settings → Media Servers**: list/add/test media servers
- **Settings → Security**: login + API key list/create/revoke
- **Movies**: add/list/evaluate/search+grab/manual grab
- **Activity → Queue**: live queue polling + remove

## Scripts

```bash
bun run dev
bun run build
bun run preview
bun run test
bun run typecheck
bun run lint
bun run fmt:check
```

## Database

- Drizzle schema: `src/db/schema.ts`
- Migration config: `drizzle.config.ts`

## Architecture Notes

- Integrations are resolved via `AdapterRegistry` (download/indexer/media server).
- Core services are Effect `Context.Tag`s provided via Layers (`src/effect/layers.ts`).
- tRPC procedures bridge through `runEffect()` (`src/integrations/trpc/init.ts`).
