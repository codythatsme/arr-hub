import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createQBittorrentAdapter } from "./QBittorrentAdapter"

afterEach(() => {
  vi.restoreAllMocks()
})

function textResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, init)
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init)
}

function config() {
  return {
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
  }
}

function torrent(hash: string, name = "Example.Movie.2026.1080p") {
  return {
    hash,
    name,
    state: "downloading",
    size: 1000,
    progress: 0.1,
    eta: 60,
    dlspeed: 10,
  }
}

describe("QBittorrentAdapter", () => {
  it("recovers the hash for torrent URL adds by diffing the torrent list", async () => {
    let infoCalls = 0
    let addPaused: string | null = null
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = new URL(String(input))
      if (url.pathname === "/api/v2/auth/login") {
        return Promise.resolve(
          textResponse("Ok.", { headers: { "set-cookie": "SID=test-session; HttpOnly" } }),
        )
      }
      if (url.pathname === "/api/v2/torrents/info") {
        infoCalls += 1
        return Promise.resolve(
          jsonResponse(
            infoCalls === 1
              ? [torrent("OLD")]
              : [torrent("OLD"), { ...torrent("NEW"), added_on: 1_778_390_000 }],
          ),
        )
      }
      if (url.pathname === "/api/v2/torrents/add") {
        addPaused = new URLSearchParams(String(init?.body)).get("paused")
        return Promise.resolve(textResponse("Ok."))
      }
      return Promise.resolve(textResponse("missing", { status: 404 }))
    })

    const adapter = createQBittorrentAdapter(config())
    const hash = await Effect.runPromise(
      adapter.addDownload("https://indexer.local/files/Example.Movie.2026.torrent", {
        paused: true,
      }),
    )

    expect(hash).toBe("NEW")
    expect(addPaused).toBe("true")
  })

  it("fails URL adds when qBittorrent accepts the download but no hash can be identified", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(String(input))
      if (url.pathname === "/api/v2/auth/login") {
        return Promise.resolve(
          textResponse("Ok.", { headers: { "set-cookie": "SID=test-session; HttpOnly" } }),
        )
      }
      if (url.pathname === "/api/v2/torrents/info") {
        return Promise.resolve(jsonResponse([torrent("OLD")]))
      }
      if (url.pathname === "/api/v2/torrents/add") return Promise.resolve(textResponse("Ok."))
      return Promise.resolve(textResponse("missing", { status: 404 }))
    })

    const adapter = createQBittorrentAdapter(config())
    const error = await Effect.runPromise(
      Effect.flip(adapter.addDownload("https://indexer.local/files/Example.Movie.2026.torrent")),
    )

    expect(error.reason).toBe("invalid_response")
    expect(error.message).toContain("did not expose a torrent hash")
  })
})
