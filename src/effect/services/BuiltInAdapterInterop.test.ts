import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createPlexAdapter } from "./PlexAdapter"
import { createQBittorrentAdapter } from "./QBittorrentAdapter"
import { createSABnzbdAdapter } from "./SABnzbdAdapter"
import { createTorznabAdapter } from "./TorznabAdapter"

afterEach(() => {
  vi.restoreAllMocks()
})

function textResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, init)
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init)
}

describe("built-in adapter interoperability", () => {
  it("validates qBittorrent API requests and responses", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(String(input))
      if (url.pathname === "/api/v2/auth/login") {
        return Promise.resolve(
          textResponse("Ok.", { headers: { "set-cookie": "SID=test-session; HttpOnly" } }),
        )
      }
      if (url.pathname === "/api/v2/app/version") return Promise.resolve(textResponse("v5.0.0"))
      if (url.pathname === "/api/v2/sync/maindata") {
        return Promise.resolve(jsonResponse({ server_state: { free_space_on_disk: 1234 } }))
      }
      return Promise.resolve(textResponse("missing", { status: 404 }))
    })

    const adapter = createQBittorrentAdapter({
      id: 1,
      name: "qBittorrent",
      type: "qbittorrent",
      host: "qbittorrent.local",
      port: 8080,
      username: "admin",
      password: "password",
      useSsl: false,
      category: null,
      settings: { pollIntervalMs: 30_000 },
    })

    const health = await Effect.runPromise(adapter.testConnection())
    expect(health.version).toBe("v5.0.0")
    expect(health.freeSpaceBytes).toBe(1234)
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://qbittorrent.local:8080/api/v2/auth/login",
      expect.objectContaining({ method: "POST" }),
    )
  })

  it("validates SABnzbd API requests and responses", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(String(input))
      const mode = url.searchParams.get("mode")
      expect(url.searchParams.get("apikey")).toBe("api-key")
      if (mode === "version") return Promise.resolve(jsonResponse({ version: "4.2.0" }))
      if (mode === "queue") {
        return Promise.resolve(jsonResponse({ queue: { slots: [], diskspace2: "10" } }))
      }
      return Promise.resolve(textResponse("missing", { status: 404 }))
    })

    const adapter = createSABnzbdAdapter({
      id: 1,
      name: "SABnzbd",
      type: "sabnzbd",
      host: "sabnzbd.local",
      port: 8080,
      username: "",
      password: "api-key",
      useSsl: false,
      category: null,
      settings: { pollIntervalMs: 30_000 },
    })

    const health = await Effect.runPromise(adapter.testConnection())
    expect(health.version).toBe("4.2.0")
    expect(health.freeSpaceBytes).toBe(10 * 1024 ** 3)
  })

  it("validates Torznab caps and parses search results", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(String(input))
      if (url.searchParams.get("t") === "caps") {
        return Promise.resolve(
          textResponse(`
            <caps>
              <searching>
                <search available="yes" />
                <tv-search available="yes" />
              </searching>
              <categories>
                <category id="2000" name="Movies" />
              </categories>
            </caps>
          `),
        )
      }
      return Promise.resolve(
        textResponse(`
          <rss>
            <channel>
              <item>
                <title>Example.Movie.2026.1080p.WEB-DL</title>
                <link>http://indexer/download/1</link>
                <pubDate>Mon, 04 May 2026 00:00:00 GMT</pubDate>
                <torznab:attr name="size" value="123456" />
                <torznab:attr name="seeders" value="12" />
                <torznab:attr name="peers" value="4" />
                <torznab:attr name="category" value="2000" />
              </item>
            </channel>
          </rss>
        `),
      )
    })

    const adapter = createTorznabAdapter({
      id: 1,
      name: "Torznab",
      type: "torznab",
      baseUrl: "http://torznab.local",
      apiKey: "api-key",
      priority: 25,
      categories: [2000],
      protocol: "torrent",
    })

    const caps = await Effect.runPromise(adapter.testConnection())
    expect(caps.searchTypes).toContain("search")
    expect(caps.categories).toEqual([{ id: 2000, name: "Movies" }])

    const releases = await Effect.runPromise(adapter.search({ term: "Example", type: "movie" }))
    expect(releases[0]).toMatchObject({
      title: "Example.Movie.2026.1080p.WEB-DL",
      size: 123456,
      seeders: 12,
      leechers: 4,
      protocol: "torrent",
    })
  })

  it("validates Plex identity and root responses", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = new URL(String(input))
      const headers = init?.headers as Record<string, string> | undefined
      expect(headers?.["X-Plex-Token"]).toBe("plex-token")
      if (url.pathname === "/identity") {
        return Promise.resolve(
          jsonResponse({
            MediaContainer: {
              version: "1.40.0",
              machineIdentifier: "machine-id",
            },
          }),
        )
      }
      if (url.pathname === "/") {
        return Promise.resolve(jsonResponse({ MediaContainer: { friendlyName: "Plex Fixture" } }))
      }
      return Promise.resolve(textResponse("missing", { status: 404 }))
    })

    const adapter = createPlexAdapter({
      id: 1,
      name: "Plex",
      type: "plex",
      host: "plex.local",
      port: 32400,
      token: "plex-token",
      useSsl: false,
      settings: { syncIntervalMs: 3_600_000, monitoringEnabled: true },
    })

    const info = await Effect.runPromise(adapter.testConnection())
    expect(info).toEqual({
      serverName: "Plex Fixture",
      version: "1.40.0",
      machineId: "machine-id",
    })
  })
})
