import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createTransmissionAdapter } from "./TransmissionAdapter"

function rpcResponse(argumentsBody: unknown): Response {
  return Response.json({ result: "success", arguments: argumentsBody })
}

function sessionResponse(): Response {
  return new Response(null, {
    status: 409,
    headers: { "x-transmission-session-id": "session-id" },
  })
}

function requestBody(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(String(init?.body)) as Record<string, unknown>
}

describe("TransmissionAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("negotiates a Transmission session id and validates connectivity", async () => {
    const requests: Array<{ readonly url: string; readonly init?: RequestInit }> = []

    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      if (!new Headers(init?.headers).has("x-transmission-session-id")) return sessionResponse()
      return rpcResponse({
        version: "4.0.6",
        "rpc-version": 17,
        "download-dir-free-space": 1234,
      })
    })

    const adapter = createTransmissionAdapter({
      id: 1,
      name: "Transmission",
      type: "transmission",
      host: "transmission.local",
      port: 9091,
      username: "user",
      password: "pass",
      useSsl: false,
      category: null,
      settings: { pollIntervalMs: 30_000 },
    })

    const health = await Effect.runPromise(adapter.testConnection())

    expect(health).toEqual({
      connected: true,
      version: "4.0.6",
      freeSpaceBytes: 1234,
      errorMessage: null,
    })
    expect(requests).toHaveLength(2)
    expect(requests[0].url).toBe("http://transmission.local:9091/transmission/rpc")
    expect(new Headers(requests[0].init?.headers).get("authorization")).toBe("Basic dXNlcjpwYXNz")
    expect(new Headers(requests[1].init?.headers).get("x-transmission-session-id")).toBe(
      "session-id",
    )
  })

  it("adds, lists, and removes category-scoped torrents", async () => {
    const methods: Array<string> = []
    const bodies: Array<Record<string, unknown>> = []

    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!new Headers(init?.headers).has("x-transmission-session-id")) return sessionResponse()

      const body = requestBody(init)
      methods.push(String(body.method))
      bodies.push(body)

      if (body.method === "torrent-add") {
        return rpcResponse({
          "torrent-added": {
            hashString: "ABC123",
            id: 1,
            name: "Example.Movie.2026",
          },
        })
      }

      if (body.method === "torrent-get") {
        return rpcResponse({
          torrents: [
            {
              id: 1,
              hashString: "ABC123",
              name: "Example.Movie.2026",
              downloadDir: "/downloads",
              totalSize: 1000,
              leftUntilDone: 0,
              isFinished: true,
              eta: -1,
              status: 6,
              errorString: "",
              labels: ["arr"],
              percentDone: 1,
            },
            {
              id: 2,
              hashString: "OTHER",
              name: "Other.Movie.2026",
              downloadDir: "/downloads",
              totalSize: 1000,
              leftUntilDone: 500,
              isFinished: false,
              eta: 100,
              status: 4,
              errorString: "",
              labels: ["other"],
              percentDone: 0.5,
            },
          ],
        })
      }

      if (body.method === "torrent-remove") return rpcResponse({})

      return Response.json({ result: "method not found", arguments: {} })
    })

    const adapter = createTransmissionAdapter({
      id: 2,
      name: "Transmission",
      type: "transmission",
      host: "transmission.local",
      port: 9091,
      username: "",
      password: "",
      useSsl: false,
      category: "arr",
      settings: { pollIntervalMs: 30_000 },
    })

    const hash = await Effect.runPromise(
      adapter.addDownload("magnet:?xt=urn:btih:abc", {
        savePath: "/downloads/incoming",
        paused: true,
      }),
    )
    const queue = await Effect.runPromise(adapter.getQueue())
    await Effect.runPromise(adapter.removeDownload(hash, true))

    expect(hash).toBe("ABC123")
    expect(methods).toEqual(["torrent-add", "torrent-get", "torrent-remove"])
    expect(bodies[0].arguments).toMatchObject({
      filename: "magnet:?xt=urn:btih:abc",
      "download-dir": "/downloads/incoming",
      labels: ["arr"],
      paused: true,
    })
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
    expect(bodies[2].arguments).toEqual({
      ids: ["ABC123"],
      "delete-local-data": true,
    })
  })
})
