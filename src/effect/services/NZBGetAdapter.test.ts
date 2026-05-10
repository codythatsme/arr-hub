import { Buffer } from "node:buffer"

import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createNZBGetAdapter } from "./NZBGetAdapter"

function rpcResponse(result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", result, id: "test" })
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

describe("NZBGetAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("validates NZBGet connectivity and configured category", async () => {
    const methods: Array<string> = []
    const requests: Array<{ readonly url: string; readonly init?: RequestInit }> = []

    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      const body = requestBody(init)
      methods.push(body.method)

      if (body.method === "version") return rpcResponse("21.1")
      if (body.method === "status") return rpcResponse({ FreeDiskSpaceMB: 1024 })
      if (body.method === "config") {
        return rpcResponse([
          { Name: "KeepHistory", Value: "7" },
          { Name: "Category1.Name", Value: "tv" },
        ])
      }

      return rpcResponse(null)
    })

    const adapter = createNZBGetAdapter({
      id: 1,
      name: "NZBGet",
      type: "nzbget",
      host: "nzbget.local",
      port: 6789,
      username: "nzbget",
      password: "secret",
      useSsl: false,
      category: "tv",
      settings: { pollIntervalMs: 30_000 },
    })

    const health = await Effect.runPromise(adapter.testConnection())

    expect(health).toEqual({
      connected: true,
      version: "21.1",
      freeSpaceBytes: 1024 * 1024 * 1024,
      errorMessage: null,
    })
    expect(methods).toEqual(["version", "status", "config"])
    expect(requests[0].url).toBe("http://nzbget.local:6789/jsonrpc")
    expect(new Headers(requests[0].init?.headers).get("authorization")).toBe(
      "Basic bnpiZ2V0OnNlY3JldA==",
    )
  })

  it("adds, lists, and removes NZBs with vendor-compatible drone parameters", async () => {
    const rpcBodies: Array<ReturnType<typeof requestBody>> = []
    let droneId = ""

    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === "https://indexer.local/files/Example.Show.S01E01.nzb") {
        return new Response("<nzb />")
      }

      const body = requestBody(init)
      rpcBodies.push(body)

      if (body.method === "append") {
        const ppParameters = body.params[9]
        if (Array.isArray(ppParameters)) droneId = String(ppParameters[1])
        return rpcResponse(42)
      }

      if (body.method === "status") return rpcResponse({ DownloadPaused: false, DownloadRate: 100 })
      if (body.method === "listgroups") {
        return rpcResponse([
          {
            NZBID: 42,
            NZBName: "Example.Show.S01E01",
            Category: "tv",
            FileSizeLo: 1000,
            FileSizeHi: 0,
            RemainingSizeLo: 500,
            RemainingSizeHi: 0,
            PausedSizeLo: 0,
            PausedSizeHi: 0,
            ActiveDownloads: 1,
            Parameters: [{ Name: "drone", Value: droneId }],
          },
        ])
      }
      if (body.method === "history") {
        return rpcResponse([
          {
            ID: 99,
            Name: "Example.Show.S01E02",
            Category: "tv",
            FileSizeLo: 2000,
            FileSizeHi: 0,
            ParStatus: "SUCCESS",
            UnpackStatus: "SUCCESS",
            MoveStatus: "SUCCESS",
            ScriptStatus: "NONE",
            DeleteStatus: "NONE",
            MarkStatus: "NONE",
            DestDir: "/downloads/tv/Example.Show.S01E02",
            FinalDir: "",
            Parameters: [{ Name: "drone", Value: "history-drone" }],
          },
        ])
      }
      if (body.method === "editqueue") return rpcResponse(true)

      return rpcResponse(null)
    })

    const adapter = createNZBGetAdapter({
      id: 2,
      name: "NZBGet",
      type: "nzbget",
      host: "nzbget.local",
      port: 6789,
      username: "",
      password: "",
      useSsl: false,
      category: "tv",
      settings: { pollIntervalMs: 30_000 },
    })

    const externalId = await Effect.runPromise(
      adapter.addDownload("https://indexer.local/files/Example.Show.S01E01.nzb", { paused: true }),
    )
    const queue = await Effect.runPromise(adapter.getQueue())
    await Effect.runPromise(adapter.removeDownload(externalId, true))

    expect(externalId).toBe(droneId)
    expect(rpcBodies.map((body) => body.method)).toEqual([
      "append",
      "status",
      "listgroups",
      "history",
      "listgroups",
      "history",
      "editqueue",
    ])
    expect(rpcBodies[0].params).toMatchObject([
      "Example.Show.S01E01.nzb",
      Buffer.from("<nzb />").toString("base64"),
      "tv",
      0,
      false,
      true,
      "",
      0,
      "all",
      ["drone", droneId],
    ])
    expect(queue).toEqual([
      {
        externalId,
        title: "Example.Show.S01E01",
        status: "downloading",
        sizeBytes: 1000,
        progressFraction: 0.5,
        etaSeconds: 5,
        errorMessage: null,
        outputPath: null,
        downloadClientId: 2,
      },
      {
        externalId: "history-drone",
        title: "Example.Show.S01E02",
        status: "completed",
        sizeBytes: 2000,
        progressFraction: 1,
        etaSeconds: null,
        errorMessage: null,
        outputPath: "/downloads/tv/Example.Show.S01E02",
        downloadClientId: 2,
      },
    ])
    expect(rpcBodies.at(-1)?.params).toEqual(["GroupFinalDelete", 0, "", 42])
  })
})
