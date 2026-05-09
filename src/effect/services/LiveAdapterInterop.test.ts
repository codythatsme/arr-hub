import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { createPlexAdapter } from "./PlexAdapter"
import { createQBittorrentAdapter } from "./QBittorrentAdapter"
import { createSABnzbdAdapter } from "./SABnzbdAdapter"
import { createTorznabAdapter } from "./TorznabAdapter"

function env(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

function envNumber(name: string, fallback: number): number {
  const value = env(name)
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function envBool(name: string): boolean {
  const value = env(name)?.toLowerCase()
  return value === "1" || value === "true" || value === "yes"
}

const qbitEnabled = Boolean(env("ARR_HUB_LIVE_QBIT_HOST"))
const sabEnabled = Boolean(env("ARR_HUB_LIVE_SAB_HOST") && env("ARR_HUB_LIVE_SAB_API_KEY"))
const torznabEnabled = Boolean(
  env("ARR_HUB_LIVE_TORZNAB_URL") && env("ARR_HUB_LIVE_TORZNAB_API_KEY"),
)
const plexEnabled = Boolean(env("ARR_HUB_LIVE_PLEX_HOST") && env("ARR_HUB_LIVE_PLEX_TOKEN"))

describe("live adapter interoperability", () => {
  describe.skipIf(!qbitEnabled)("qBittorrent", () => {
    it("connects to a real qBittorrent Web API", async () => {
      const adapter = createQBittorrentAdapter({
        id: 1,
        name: "Live qBittorrent",
        type: "qbittorrent",
        host: env("ARR_HUB_LIVE_QBIT_HOST") ?? "localhost",
        port: envNumber("ARR_HUB_LIVE_QBIT_PORT", 8080),
        username: env("ARR_HUB_LIVE_QBIT_USERNAME") ?? "admin",
        password: env("ARR_HUB_LIVE_QBIT_PASSWORD") ?? "",
        useSsl: envBool("ARR_HUB_LIVE_QBIT_SSL"),
        category: env("ARR_HUB_LIVE_QBIT_CATEGORY") ?? null,
        settings: { pollIntervalMs: 30_000 },
      })

      const health = await Effect.runPromise(adapter.testConnection())

      expect(health.connected).toBe(true)
      expect(health.version).toBeTruthy()
    }, 20_000)
  })

  describe.skipIf(!sabEnabled)("SABnzbd", () => {
    it("connects to a real SABnzbd API", async () => {
      const adapter = createSABnzbdAdapter({
        id: 1,
        name: "Live SABnzbd",
        type: "sabnzbd",
        host: env("ARR_HUB_LIVE_SAB_HOST") ?? "localhost",
        port: envNumber("ARR_HUB_LIVE_SAB_PORT", 8080),
        username: "",
        password: env("ARR_HUB_LIVE_SAB_API_KEY") ?? "",
        useSsl: envBool("ARR_HUB_LIVE_SAB_SSL"),
        category: env("ARR_HUB_LIVE_SAB_CATEGORY") ?? null,
        settings: { pollIntervalMs: 30_000 },
      })

      const health = await Effect.runPromise(adapter.testConnection())

      expect(health.connected).toBe(true)
      expect(health.version).toBeTruthy()
    }, 20_000)
  })

  describe.skipIf(!torznabEnabled)("Torznab/Newznab", () => {
    it("connects to a real Torznab-compatible indexer", async () => {
      const adapter = createTorznabAdapter({
        id: 1,
        name: "Live Torznab",
        type: "torznab",
        baseUrl: env("ARR_HUB_LIVE_TORZNAB_URL") ?? "http://localhost",
        apiKey: env("ARR_HUB_LIVE_TORZNAB_API_KEY") ?? "",
        priority: envNumber("ARR_HUB_LIVE_TORZNAB_PRIORITY", 25),
        categories: [],
        protocol: env("ARR_HUB_LIVE_TORZNAB_PROTOCOL") === "usenet" ? "usenet" : "torrent",
      })

      const caps = await Effect.runPromise(adapter.testConnection())

      expect(caps.searchTypes.length).toBeGreaterThan(0)
    }, 20_000)
  })

  describe.skipIf(!plexEnabled)("Plex", () => {
    it("connects to a real Plex Media Server", async () => {
      const adapter = createPlexAdapter({
        id: 1,
        name: "Live Plex",
        type: "plex",
        host: env("ARR_HUB_LIVE_PLEX_HOST") ?? "localhost",
        port: envNumber("ARR_HUB_LIVE_PLEX_PORT", 32400),
        token: env("ARR_HUB_LIVE_PLEX_TOKEN") ?? "",
        useSsl: envBool("ARR_HUB_LIVE_PLEX_SSL"),
        settings: { syncIntervalMs: 3_600_000, monitoringEnabled: true },
      })

      const info = await Effect.runPromise(adapter.testConnection())

      expect(info.machineId).toBeTruthy()
      expect(info.version).toBeTruthy()
    }, 20_000)
  })
})
