import { existsSync } from "node:fs"

import { config as loadDotenv } from "dotenv"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import type { IndexerProtocol, ReleaseCandidate } from "../domain/indexer"
import { createTorznabAdapter } from "./TorznabAdapter"

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", override: false })
loadDotenv({ override: false })

interface LiveIndexerTarget {
  readonly name: string
  readonly baseUrl: string
  readonly apiKey: string
  readonly protocol: IndexerProtocol
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

function target(
  name: string,
  baseUrl: string | undefined,
  defaultBaseUrl: string,
  apiKey: string | undefined,
  protocol: IndexerProtocol,
): LiveIndexerTarget | null {
  if (!apiKey) return null
  return { name, baseUrl: baseUrl ?? defaultBaseUrl, apiKey, protocol }
}

const requiredTargets = [
  target(
    "NZBGeek",
    env("ARR_HUB_LIVE_NZBGEEK_URL"),
    "https://api.nzbgeek.info",
    env("ARR_HUB_LIVE_NZBGEEK_API_KEY"),
    "usenet",
  ),
  target(
    "DrunkenSlug",
    env("ARR_HUB_LIVE_DRUNKENSLUG_URL"),
    "https://drunkenslug.com",
    env("ARR_HUB_LIVE_DRUNKENSLUG_API_KEY"),
    "usenet",
  ),
  target(
    "NZBFinder",
    env("ARR_HUB_LIVE_NZBFINDER_URL"),
    "https://nzbfinder.ws",
    env("ARR_HUB_LIVE_NZBFINDER_API_KEY"),
    "usenet",
  ),
  target(
    env("ARR_HUB_LIVE_TORRENT_NAME") ?? "Torrent Torznab",
    env("ARR_HUB_LIVE_TORRENT_URL"),
    "",
    env("ARR_HUB_LIVE_TORRENT_API_KEY"),
    "torrent",
  ),
] as const

const optionalNewznab = target(
  env("ARR_HUB_LIVE_OPTIONAL_NEWZNAB_NAME") ?? "Optional Newznab",
  env("ARR_HUB_LIVE_OPTIONAL_NEWZNAB_URL"),
  "",
  env("ARR_HUB_LIVE_OPTIONAL_NEWZNAB_API_KEY"),
  "usenet",
)

const requiredEnabled = requiredTargets.every((item) => item !== null && item.baseUrl.length > 0)
const targets = [
  ...requiredTargets.flatMap((item) => (item ? [item] : [])),
  ...(optionalNewznab?.baseUrl ? [optionalNewznab] : []),
]

function validateCandidate(candidate: ReleaseCandidate, protocol: IndexerProtocol) {
  expect(candidate.title.trim().length).toBeGreaterThan(0)
  expect(candidate.downloadUrl.trim().length).toBeGreaterThan(0)
  expect(candidate.protocol).toBe(protocol)
  expect(Number.isFinite(candidate.size)).toBe(true)
  expect(candidate.size).toBeGreaterThanOrEqual(0)
  expect(Number.isNaN(candidate.publishedAt.getTime())).toBe(false)
}

async function validateTarget(item: LiveIndexerTarget, index: number) {
  const adapter = createTorznabAdapter({
    id: index + 1,
    name: item.name,
    type: item.protocol === "usenet" ? "newznab" : "torznab",
    baseUrl: item.baseUrl,
    apiKey: item.apiKey,
    priority: 25,
    categories: [],
    protocol: item.protocol,
  })

  const caps = await Effect.runPromise(adapter.testConnection())
  expect(caps.searchTypes.length, `${item.name} caps search types`).toBeGreaterThan(0)
  expect(caps.categories.length, `${item.name} caps categories`).toBeGreaterThan(0)

  const rss = adapter.rss
  expect(rss, `${item.name} rss adapter`).toBeDefined()
  if (!rss) throw new Error(`${item.name} does not expose an RSS adapter`)

  const recent = await Effect.runPromise(rss({ limit: 5, protocol: item.protocol }))
  expect(Array.isArray(recent), `${item.name} recent feed`).toBe(true)
  for (const candidate of recent.slice(0, 3)) {
    validateCandidate(candidate, item.protocol)
  }

  const query =
    item.protocol === "usenet"
      ? (env("ARR_HUB_LIVE_COMMON_USENET_QUERY") ?? "matrix")
      : (env("ARR_HUB_LIVE_COMMON_TORRENT_QUERY") ?? "ubuntu")
  const search = await Effect.runPromise(
    adapter.search({ type: "general", term: query, limit: 5, protocol: item.protocol }),
  )
  expect(Array.isArray(search), `${item.name} search`).toBe(true)
  for (const candidate of search.slice(0, 3)) {
    validateCandidate(candidate, item.protocol)
  }
}

describe.skipIf(!requiredEnabled)("common live indexer validation", () => {
  it("validates NZBGeek, DrunkenSlug, NZBFinder, any optional Newznab, and one Torznab path", async () => {
    expect(targets.length).toBeGreaterThanOrEqual(4)
    await Promise.all(targets.map((item, index) => validateTarget(item, index)))
  }, 120_000)
})
