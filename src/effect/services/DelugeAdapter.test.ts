import { Buffer } from "node:buffer"

import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createDelugeAdapter } from "./DelugeAdapter"

function rpcResponse(result: unknown, init?: ResponseInit): Response {
  return Response.json({ jsonrpc: "2.0", result, id: "test" }, init)
}

function requestBody(init: RequestInit | undefined): {
  readonly method: string
  readonly params: ReadonlyArray<unknown>
} {
  return JSON.parse(String(init?.body)) as {
    readonly method: string
    readonly params: ReadonlyArray<unknown>
  }
}

describe("DelugeAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("authenticates, connects the daemon, and validates labels", async () => {
    const requests: Array<{ readonly method: string; readonly cookie: string | null }> = []

    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      const body = requestBody(init)
      requests.push({ method: body.method, cookie: headers.get("cookie") })

      if (body.method === "auth.login") {
        return rpcResponse(true, { headers: { "set-cookie": "_session_id=session; Path=/" } })
      }
      if (body.method === "web.connected") return rpcResponse(false)
      if (body.method === "web.get_hosts") {
        return rpcResponse([["daemon-id", "127.0.0.1", 58846, "Online"]])
      }
      if (body.method === "web.connect") return rpcResponse(true)
      if (body.method === "system.listMethods") {
        return rpcResponse([
          "daemon.get_version",
          "label.get_labels",
          "label.add",
          "label.set_torrent",
        ])
      }
      if (body.method === "daemon.get_version") return rpcResponse("2.1.1")
      if (body.method === "label.get_labels") return rpcResponse(["tv"])
      if (body.method === "web.update_ui") return rpcResponse({ torrents: {} })

      return rpcResponse(null)
    })

    const adapter = createDelugeAdapter({
      id: 1,
      name: "Deluge",
      type: "deluge",
      host: "deluge.local",
      port: 8112,
      username: "",
      password: "deluge",
      useSsl: false,
      category: "tv",
      settings: { pollIntervalMs: 30_000 },
    })

    const health = await Effect.runPromise(adapter.testConnection())

    expect(health).toEqual({
      connected: true,
      version: "2.1.1",
      freeSpaceBytes: null,
      errorMessage: null,
    })
    expect(requests.map((request) => request.method)).toEqual([
      "auth.login",
      "web.connected",
      "web.get_hosts",
      "web.connect",
      "system.listMethods",
      "daemon.get_version",
      "system.listMethods",
      "label.get_labels",
      "web.update_ui",
    ])
    expect(requests[0].cookie).toBeNull()
    expect(requests[1].cookie).toBe("_session_id=session")
  })

  it("adds, lists, and removes torrents with Deluge JSON-RPC methods", async () => {
    const bodies: Array<ReturnType<typeof requestBody>> = []

    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === "https://indexer.local/files/Example.Movie.2026.torrent") {
        return new Response("torrent-data")
      }

      const body = requestBody(init)
      bodies.push(body)

      if (body.method === "auth.login") {
        return rpcResponse(true, { headers: { "set-cookie": "_session_id=session; Path=/" } })
      }
      if (body.method === "web.connected") return rpcResponse(true)
      if (body.method === "system.listMethods") {
        return rpcResponse(["daemon.get_version", "label.get_labels", "label.set_torrent"])
      }
      if (body.method === "label.get_labels") return rpcResponse(["movies"])
      if (body.method === "core.add_torrent_magnet") return rpcResponse("abc123")
      if (body.method === "core.add_torrent_file") return rpcResponse("def456")
      if (body.method === "label.set_torrent") return rpcResponse(null)
      if (body.method === "web.update_ui") {
        return rpcResponse({
          torrents: {
            abc123: {
              hash: "abc123",
              name: "Example.Movie.2026",
              state: "Seeding",
              progress: 100,
              eta: 0,
              message: "",
              is_finished: true,
              save_path: "/downloads",
              total_size: 1000,
              total_done: 1000,
            },
          },
        })
      }
      if (body.method === "core.remove_torrent") return rpcResponse(true)

      return rpcResponse(null)
    })

    const adapter = createDelugeAdapter({
      id: 2,
      name: "Deluge",
      type: "deluge",
      host: "deluge.local",
      port: 8112,
      username: "",
      password: "deluge",
      useSsl: false,
      category: "movies",
      settings: { pollIntervalMs: 30_000 },
    })

    const magnetHash = await Effect.runPromise(
      adapter.addDownload("magnet:?xt=urn:btih:abc123", {
        savePath: "/downloads/incoming",
        paused: true,
      }),
    )
    const fileHash = await Effect.runPromise(
      adapter.addDownload("https://indexer.local/files/Example.Movie.2026.torrent"),
    )
    const queue = await Effect.runPromise(adapter.getQueue())
    await Effect.runPromise(adapter.removeDownload(magnetHash, true))

    expect(magnetHash).toBe("ABC123")
    expect(fileHash).toBe("DEF456")
    expect(bodies.map((body) => body.method)).toEqual([
      "auth.login",
      "web.connected",
      "system.listMethods",
      "label.get_labels",
      "core.add_torrent_magnet",
      "label.set_torrent",
      "system.listMethods",
      "label.get_labels",
      "core.add_torrent_file",
      "label.set_torrent",
      "web.update_ui",
      "core.remove_torrent",
    ])
    expect(bodies[4].params).toEqual([
      "magnet:?xt=urn:btih:abc123",
      {
        add_paused: true,
        remove_at_ratio: false,
        download_location: "/downloads/incoming",
      },
    ])
    expect(bodies[8].params).toEqual([
      "Example.Movie.2026.torrent",
      Buffer.from("torrent-data").toString("base64"),
      {
        add_paused: false,
        remove_at_ratio: false,
      },
    ])
    expect(queue).toEqual([
      {
        externalId: "ABC123",
        title: "Example.Movie.2026",
        status: "completed",
        sizeBytes: 1000,
        progressFraction: 1,
        etaSeconds: null,
        errorMessage: null,
        outputPath: "/downloads/Example.Movie.2026",
        downloadClientId: 2,
      },
    ])
    expect(bodies.at(-1)?.params).toEqual(["abc123", true])
  })
})
