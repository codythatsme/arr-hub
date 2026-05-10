import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createTorznabAdapter } from "./TorznabAdapter"

const CAPS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<caps>
  <searching>
    <search available="yes" />
    <tv-search available="yes" />
    <movie-search available="yes" />
  </searching>
  <categories>
    <category id="2000" name="Movies">
      <subcat id="2010" name="Movies HD" />
    </category>
  </categories>
</caps>`

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Example Movie 2026 1080p WEB-DL</title>
      <link>https://tracker.example/download/1</link>
      <pubDate>Fri, 01 May 2026 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`

describe("TorznabAdapter proxy transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("passes HTTP proxy settings to outbound fetch", async () => {
    let requestInit: RequestInit | undefined
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestInit = init
      return new Response(CAPS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createTorznabAdapter({
      id: 1,
      name: "Proxy Test",
      type: "torznab",
      baseUrl: "https://tracker.example",
      apiKey: "api-key",
      priority: 25,
      categories: [],
      protocol: "torrent",
      proxy: {
        type: "http",
        host: "proxy.local",
        port: 8080,
        username: "proxy-user",
        password: "proxy-pass",
        settings: {},
      },
    })

    const caps = await Effect.runPromise(adapter.testConnection())

    expect(caps.searchTypes).toEqual(["search", "tvsearch", "movie"])
    expect(caps.categories).toEqual([
      { id: 2000, name: "Movies" },
      { id: 2010, name: "Movies HD" },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((requestInit as { readonly proxy?: string } | undefined)?.proxy).toBe(
      "http://proxy-user:proxy-pass@proxy.local:8080/",
    )
    expect((requestInit as { readonly dispatcher?: unknown } | undefined)?.dispatcher).toBeDefined()
  })

  it("routes requests through FlareSolverr when configured", async () => {
    let requestUrl: string | undefined
    let requestBody: unknown
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input)
      requestBody = JSON.parse(String(init?.body))
      return new Response(
        JSON.stringify({ status: "ok", solution: { status: 200, response: RSS_XML } }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createTorznabAdapter({
      id: 1,
      name: "Flare Test",
      type: "torznab",
      baseUrl: "https://tracker.example",
      apiKey: "api-key",
      priority: 25,
      categories: [],
      protocol: "torrent",
      proxy: {
        type: "flaresolverr",
        host: "http://flare.local:8191",
        port: null,
        username: null,
        password: null,
        settings: { flaresolverrTimeoutMs: 45_000 },
      },
    })

    const releases = await Effect.runPromise(adapter.search({ term: "example", type: "movie" }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requestUrl).toBe("http://flare.local:8191/v1")
    expect(requestBody).toMatchObject({
      cmd: "request.get",
      maxTimeout: 45_000,
    })
    expect((requestBody as { readonly url: string }).url).toContain("/api?apikey=api-key")
    expect(releases[0].title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("forwards pagination and extended search parameters", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createTorznabAdapter({
      id: 2,
      name: "Pagination Test",
      type: "torznab",
      baseUrl: "https://tracker.example",
      apiKey: "api-key",
      priority: 25,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({
        term: "example",
        type: "tv",
        categories: [5000],
        limit: 100,
        offset: 50,
        extended: "1",
      }),
    )

    const url = new URL(requestUrl ?? "")
    expect(url.searchParams.get("t")).toBe("tvsearch")
    expect(url.searchParams.get("limit")).toBe("100")
    expect(url.searchParams.get("offset")).toBe("50")
    expect(url.searchParams.get("extended")).toBe("1")
    expect(url.searchParams.get("cat")).toBe("5000")
  })
})
