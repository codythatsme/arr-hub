import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"

import { IndexerError } from "../errors"
import { createCardigannYamlAdapter } from "./CardigannAdapter"

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Example Movie 2026 1080p WEB-DL</title>
      <link>https://tracker.example/download/1</link>
      <pubDate>Fri, 01 May 2026 00:00:00 GMT</pubDate>
      <torznab:attr name="size" value="123456" />
      <torznab:attr name="seeders" value="44" />
      <torznab:attr name="category" value="2000" />
    </item>
  </channel>
</rss>`

describe("CardigannAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("builds Cardigann-style XML search requests from the selected definition", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 7,
      name: "Cardigann Movies",
      type: "cardigann_yaml",
      definitionKey: "public-domain-movie-torrents",
      baseUrl: "https://tracker.example/root",
      apiKey: "api-key",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Example Movie", type: "movie", categories: [2000], limit: 50 }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.origin).toBe("https://tracker.example")
    expect(url.pathname).toBe("/api")
    expect(url.searchParams.get("apikey")).toBe("api-key")
    expect(url.searchParams.get("t")).toBe("movie")
    expect(url.searchParams.get("q")).toBe("Example Movie")
    expect(url.searchParams.get("cat")).toBe("movies")
    expect(url.searchParams.get("limit")).toBe("50")
    expect(releases[0]).toMatchObject({
      title: "Example Movie 2026 1080p WEB-DL",
      indexerId: 7,
      indexerName: "Cardigann Movies",
      indexerPriority: 15,
      size: 123456,
      seeders: 44,
      category: "2000",
      protocol: "torrent",
    })
  })

  it("returns definition capabilities without a network request when testing connection", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 8,
      name: "Cardigann TV",
      type: "cardigann_yaml",
      definitionKey: "open-tv-torrents",
      baseUrl: "https://tracker.example",
      apiKey: "api-key",
      priority: 50,
      categories: [],
      protocol: "torrent",
    })

    const caps = await Effect.runPromise(adapter.testConnection())

    expect(fetchMock).not.toHaveBeenCalled()
    expect(caps.searchTypes).toEqual(["search", "tvsearch"])
    expect(caps.categories.map((category) => category.id)).toEqual([5000, 5040])
  })

  it("fails when the configured definition key is unknown", async () => {
    const adapter = createCardigannYamlAdapter({
      id: 9,
      name: "Missing Definition",
      type: "cardigann_yaml",
      definitionKey: "missing-definition",
      baseUrl: "https://tracker.example",
      apiKey: "api-key",
      priority: 50,
      categories: [],
      protocol: "torrent",
    })

    const error = await Effect.runPromise(Effect.flip(adapter.search({ term: "x", type: "movie" })))

    expect(error).toBeInstanceOf(IndexerError)
    expect(error.reason).toBe("invalid_response")
    expect(error.message).toContain("unknown Cardigann definition")
  })
})
