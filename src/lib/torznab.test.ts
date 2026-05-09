import { describe, expect, it } from "vitest"

import type { ReleaseCandidate } from "#/effect/domain/indexer"

import {
  buildCapsXml,
  buildReleaseFeedXml,
  buildTorznabErrorXml,
  parseAggregateIndexerRequest,
  protocolFromPath,
} from "./torznab"

describe("torznab aggregate helpers", () => {
  it("maps route path protocols", () => {
    expect(protocolFromPath("torznab")).toBe("torrent")
    expect(protocolFromPath("newznab")).toBe("usenet")
    expect(protocolFromPath("other")).toBeNull()
  })

  it("parses caps and search requests", () => {
    const caps = parseAggregateIndexerRequest(
      new URL("http://arr/api/indexers/aggregate/torznab?t=caps"),
      "torrent",
    )
    expect(caps).toEqual({ ok: true, request: { kind: "caps" } })

    const search = parseAggregateIndexerRequest(
      new URL(
        "http://arr/api/indexers/aggregate/torznab?t=tvsearch&q=Show&cat=5000,5070&tvdbid=123&season=2&ep=4&limit=25&offset=50&extended=1",
      ),
      "torrent",
    )
    expect(search.ok).toBe(true)
    if (!search.ok) throw new Error(search.error)
    expect(search.request).toMatchObject({
      kind: "search",
      query: {
        term: "Show",
        type: "tv",
        categories: [5000, 5070],
        tvdbId: 123,
        season: 2,
        episode: 4,
        limit: 25,
        offset: 50,
        extended: "1",
        protocol: "torrent",
      },
    })
  })

  it("renders aggregate caps XML", () => {
    const xml = buildCapsXml(
      {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: [
          { id: 2000, name: "Movies" },
          { id: 5000, name: "TV" },
        ],
      },
      "torrent",
    )

    expect(xml).toContain("<caps>")
    expect(xml).toContain('protocol="torrent"')
    expect(xml).toContain('<movie-search available="yes"')
    expect(xml).toContain('supportedParams="q,cat,limit,offset,extended,imdbid,tmdbid"')
    expect(xml).toContain('<category id="5000" name="TV" />')
  })

  it("renders release feed XML with escaped values", () => {
    const release: ReleaseCandidate = {
      title: 'A & B "Movie" 2026',
      indexerId: 1,
      indexerName: "Indexer",
      indexerPriority: 50,
      size: 1234,
      seeders: 12,
      leechers: 3,
      age: 0,
      downloadUrl: "https://example.com/download?x=1&y=2",
      infoUrl: null,
      category: "2000",
      protocol: "torrent",
      publishedAt: new Date("2026-01-01T00:00:00Z"),
      infohash: "abc123",
      downloadFactor: 1,
      uploadFactor: 1,
    }

    const xml = buildReleaseFeedXml([release], "torznab")
    expect(xml).toContain('xmlns:torznab="http://torznab.com/schemas/2015/feed"')
    expect(xml).toContain("A &amp; B &quot;Movie&quot; 2026")
    expect(xml).toContain("https://example.com/download?x=1&amp;y=2")
    expect(xml).toContain('<torznab:attr name="seeders" value="12" />')
  })

  it("renders Torznab-style error XML", () => {
    expect(buildTorznabErrorXml(100, "missing & invalid")).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<error code="100" description="missing &amp; invalid" />',
    )
  })
})
