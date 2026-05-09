import { Cause, Effect, Exit, Option } from "effect"
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

const JSON_RESULTS = JSON.stringify({
  data: {
    results: [
      {
        title: "JSON Movie 2026 1080p WEB-DL",
        links: {
          download: "/download/json",
          details: "/details/json",
        },
        category: {
          name: "Movies",
        },
        stats: {
          size: "1250 MB",
          seeders: 88,
          leechers: 4,
        },
        published: "2026-05-08T00:00:00.000Z",
        infohash: "0123456789abcdef0123456789abcdef01234567",
      },
    ],
  },
})

const JSON_SELECTOR_FILTER_RESULTS = JSON.stringify({
  data: {
    results: [
      {
        title: "Keep Movie 2026 1080p WEB-DL",
        links: {
          download: "/download/keep",
          details: "/details/keep",
        },
        category: "Movies",
        stats: {
          size: "2 GB",
          seeders: 51,
        },
        tags: ["freeleech", "featured"],
        published: "2026-05-09T00:00:00.000Z",
      },
      {
        title: "Missing Download Movie 2026 1080p WEB-DL",
        links: {
          details: "/details/missing",
        },
        category: "Movies",
        stats: {
          size: "3 GB",
          seeders: 40,
        },
        tags: ["freeleech"],
        published: "2026-05-09T00:00:00.000Z",
      },
      {
        title: "Dead Movie 2026 1080p WEB-DL",
        links: {
          download: "/download/dead",
        },
        category: "Movies",
        stats: {
          size: "4 GB",
          seeders: 30,
        },
        status: {
          dead: true,
        },
        tags: ["freeleech"],
        published: "2026-05-09T00:00:00.000Z",
      },
      {
        title: "Wrong Tag Movie 2026 1080p WEB-DL",
        links: {
          download: "/download/wrong-tag",
        },
        category: "Movies",
        stats: {
          size: "5 GB",
          seeders: 20,
        },
        tags: ["internal"],
        published: "2026-05-09T00:00:00.000Z",
      },
    ],
  },
})

const HTML_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent">
          <td><a class="category" href="/browse?cat=movies">Movies</a></td>
          <td><a class="short-title">Fallback Movie 2026 1080p WEB-DL</a></td>
          <td>
            <a class="details" href="/details/1">Details</a>
            <a class="download" href="/download/1">Download</a>
          </td>
          <td class="size">1.5 GiB</td>
          <td class="seeders">1,234</td>
          <td class="leechers">56</td>
          <td><time datetime="2026-05-01T00:00:00.000Z">May 1 2026</time></td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_FIELD_MODIFIER_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent">
          <td class="title-main">Modifier.Movie</td>
          <td class="title-extra">.2026.1080p.WEB-DL</td>
          <td><a class="download" href="/download/modifier">Download</a></td>
          <td class="category">Movies</td>
          <td class="seeders">17</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_RELATIVE_TIME_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent">
          <td><a class="title">Relative Time Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download" href="/download/relative">Download</a></td>
          <td class="size">700 MB</td>
          <td class="date">2 days ago</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_DATEPARSE_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent">
          <td><a class="title">Date Parse Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download" href="/download/dateparse">Download</a></td>
          <td class="size">800 MB</td>
          <td class="date">2026-May-02 13:45:30 +00:00</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_DATE_HEADER_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="day">
          <td class="date-header">2026-05-04</td>
        </tr>
        <tr class="torrent">
          <td><a class="title">Header Date Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download" href="/download/header-date">Download</a></td>
          <td class="size">850 MB</td>
        </tr>
        <tr class="torrent">
          <td><a class="title">Second Header Date Movie 2026 720p WEB-DL</a></td>
          <td><a class="download" href="/download/second-header-date">Download</a></td>
          <td class="size">650 MB</td>
        </tr>
        <tr class="day">
          <td class="date-header">2026-05-05</td>
        </tr>
        <tr class="torrent">
          <td><a class="title">Next Header Date Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download" href="/download/next-header-date">Download</a></td>
          <td class="size">950 MB</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_FIELD_FILTER_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent">
          <td><a class="title">Crème Movie: 2026/1080p* WEB-DL</a></td>
          <td><a class="download" href="/download/filtered">Download</a></td>
          <td class="category">Movies HD English</td>
          <td class="date">May 6th 2026 00:00 UTC</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_JSON_JOIN_FIELD_FILTER_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent">
          <td class="title-json">{"parts":["JSON","Join","Movie","2026","1080p","WEB-DL"]}</td>
          <td><a class="download" href="/download/json-joined">Download</a></td>
          <td class="category-json">{"categories":["Movies"]}</td>
          <td class="date">2026-05-07T00:00:00.000Z</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_ROW_FILTER_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent">
          <td><a class="title">Wanted Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download" href="/download/wanted">Download</a></td>
          <td class="size">900 MB</td>
        </tr>
        <tr class="torrent">
          <td><a class="title">Unrelated Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download" href="/download/unrelated">Download</a></td>
          <td class="size">950 MB</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_NESTED_RESULTS = `<!doctype html>
<html>
  <body>
    <table class="results">
      <tbody>
        <tr class="torrent">
          <td class="noise"><a href="/wrong">Wrong Link</a></td>
          <td class="name"><a href="/details/2">Nested Movie 2026 2160p WEB-DL</a></td>
          <td class="stats"><span class="size">2 GB</span></td>
          <td class="actions"><a class="download" href="/download/2">Download</a></td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_AFTER_RESULTS = `<!doctype html>
<html>
  <body>
    <table class="results">
      <tbody>
        <tr>
          <td class="name"><a href="/details/3">Split Row Movie 2026 1080p BluRay</a></td>
          <td class="actions"><a class="download" href="/download/3">Download</a></td>
        </tr>
        <tr>
          <td colspan="2">
            <span class="size">3.5 GiB</span>
            <time datetime="2026-05-03T00:00:00.000Z">May 3 2026</time>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_REMOVE_RESULTS = `<!doctype html>
<html>
  <body>
    <table class="results">
      <tbody>
        <tr class="torrent">
          <td class="name">
            <a href="/details/4">
              <span class="badge">Freeleech</span>
              Clean Movie 2026 1080p WEB-DL
            </a>
          </td>
          <td class="actions"><a class="download" href="/download/4">Download</a></td>
          <td class="size">4 GB</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_SELF_SELECTOR_RESULTS = `<!doctype html>
<html>
  <body>
    <table class="results">
      <tbody>
        <tr class="torrent" data-title="Self Match Movie 2026 1080p WEB-DL" data-details="/details/5" data-category="movies">
          <td class="actions"><a class="download" href="/download/5">Download</a></td>
          <td class="size">5 GB</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

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

  it("parses first-pass Cardigann JSON selector results", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 57,
      name: "JSON Cardigann",
      type: "cardigann_yaml",
      definitionKey: "json-cardigann",
      definitionYaml: `
id: json-cardigann
name: JSON Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /api/search
      response:
        type: json
      inputs:
        q: "{{ .Keywords }}"
        cat: "{{ .Categories }}"
  rows:
    selector: $.data.results
  fields:
    title:
      selector: title
    details:
      selector: links.details
    download:
      selector: links.download
    category:
      selector: category.name
      case:
        Movies: movies
    size:
      selector: stats.size
    seeders:
      selector: stats.seeders
    leechers:
      selector: stats.leechers
    infohash:
      selector: infohash
    date:
      selector: published
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "JSON Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.pathname).toBe("/api/search")
    expect(url.searchParams.get("q")).toBe("JSON Movie")
    expect(url.searchParams.get("cat")).toBe("movies")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "JSON Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/json",
      infoUrl: "https://tracker.example/details/json",
      category: "2000",
      size: 1_250_000_000,
      seeders: 88,
      leechers: 4,
      infohash: "0123456789abcdef0123456789abcdef01234567",
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-08T00:00:00.000Z")
  })

  it("filters Cardigann JSON selectors with has, not, and contains pseudo filters", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON_SELECTOR_FILTER_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 66,
      name: "JSON Selector Filter Cardigann",
      type: "cardigann_yaml",
      definitionKey: "json-selector-filter-cardigann",
      definitionYaml: `
id: json-selector-filter-cardigann
name: JSON Selector Filter Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /api/search
      response:
        type: json
  rows:
    selector: $.data.results:has(links.download):has(tags:contains(freeleech)):not(status.dead)
  fields:
    title:
      selector: title:contains(Keep Movie)
    details:
      selector: links.details
    download:
      selector: links.download:contains(/download/)
    category:
      selector: category:contains(Movies)
      case:
        Movies: movies
    size:
      selector: stats.size
    seeders:
      selector: stats.seeders
    date:
      selector: published
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Keep Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Keep Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/keep",
      infoUrl: "https://tracker.example/details/keep",
      category: "2000",
      size: 2_000_000_000,
      seeders: 51,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-09T00:00:00.000Z")
  })

  it("normalizes Cardigann field-name modifiers in JSON selector results", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 65,
      name: "JSON Field Modifier Cardigann",
      type: "cardigann_yaml",
      definitionKey: "json-field-modifier-cardigann",
      definitionYaml: `
id: json-field-modifier-cardigann
name: JSON Field Modifier Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /api/search
      response:
        type: json
  rows:
    selector: $.data.results
  fields:
    title:
      selector: title
    title|append:
      text: .Extended
    download|optional:
      selector: links.download
    category:
      selector: category.name
      case:
        Movies: movies
    seeders:
      selector: stats.seeders
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "JSON Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "JSON Movie 2026 1080p WEB-DL.Extended",
      downloadUrl: "https://tracker.example/download/json",
      category: "2000",
      seeders: 88,
      protocol: "torrent",
    })
  })

  it("returns no releases when Cardigann JSON rows count is empty", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { total: 0 } })))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 61,
      name: "JSON Count Cardigann",
      type: "cardigann_yaml",
      definitionKey: "json-count-cardigann",
      definitionYaml: `
id: json-count-cardigann
name: JSON Count Cardigann
links:
  - https://tracker.example
caps:
  categorymappings: []
  modes:
    search: [q]
search:
  paths:
    - path: /api/search
      response:
        type: json
  rows:
    selector: $.data.results
    count:
      selector: $.data.total
  fields:
    title:
      selector: title
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Missing Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toEqual([])
  })

  it("expands Cardigann JSON row attributes with multiple rows", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              results: [
                {
                  torrents: {
                    hd: {
                      title: "Nested JSON Movie 2026 1080p WEB-DL",
                      download: "/download/nested-hd",
                      category: "Movies",
                      size: "1.4 GB",
                      seeders: 32,
                    },
                    remux: {
                      title: "Nested JSON Movie 2026 2160p Remux",
                      download: "/download/nested-remux",
                      category: "Movies",
                      size: "55 GB",
                      seeders: 12,
                    },
                  },
                },
                { ignored: true },
              ],
            },
          }),
        ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 62,
      name: "JSON Attribute Cardigann",
      type: "cardigann_yaml",
      definitionKey: "json-attribute-cardigann",
      definitionYaml: `
id: json-attribute-cardigann
name: JSON Attribute Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /api/search
      response:
        type: json
  rows:
    selector: $.data.results
    attribute: torrents
    multiple: true
    missingAttributeEqualsNoResults: true
  fields:
    title:
      selector: title
    download:
      selector: download
    category:
      selector: category
    size:
      selector: size
    seeders:
      selector: seeders
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Nested JSON Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(2)
    expect(releases.map((release) => release.title)).toEqual([
      "Nested JSON Movie 2026 1080p WEB-DL",
      "Nested JSON Movie 2026 2160p Remux",
    ])
    expect(releases[0]).toMatchObject({
      downloadUrl: "https://tracker.example/download/nested-hd",
      category: "2000",
      size: 1_400_000_000,
      seeders: 32,
    })
    expect(releases[1]).toMatchObject({
      downloadUrl: "https://tracker.example/download/nested-remux",
      category: "2000",
      size: 55_000_000_000,
      seeders: 12,
    })
  })

  it("applies Cardigann preprocessing filters before JSON parsing", async () => {
    const fetchMock = vi.fn(async () => new Response(`callback(${JSON_RESULTS});`, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 58,
      name: "Preprocessed JSON Cardigann",
      type: "cardigann_yaml",
      definitionKey: "preprocessed-json-cardigann",
      definitionYaml: `
id: preprocessed-json-cardigann
name: Preprocessed JSON Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  preprocessingfilters:
    - name: regexp
      args: 'callback\\(([\\s\\S]*)\\);'
  paths:
    - path: /api/jsonp
      response:
        type: json
      inputs:
        q: "{{ .Keywords }}"
  rows:
    selector: $.data.results
  fields:
    title:
      selector: title
    download:
      selector: links.download
    category:
      selector: category.name
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 30,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "JSON Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "JSON Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/json",
      category: "2000",
    })
  })

  it("applies Cardigann preprocessing filters before XML parsing", async () => {
    const fetchMock = vi.fn(async () => new Response(`noise:${RSS_XML}:noise`, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 59,
      name: "Preprocessed XML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "preprocessed-xml-cardigann",
      definitionYaml: `
id: preprocessed-xml-cardigann
name: Preprocessed XML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  preprocessingfilters:
    - name: regexp
      args: '[\\s\\S]*(<rss[\\s\\S]*</rss>)[\\s\\S]*'
  paths:
    - path: /api/xml
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 25,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Example Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases[0]).toMatchObject({
      title: "Example Movie 2026 1080p WEB-DL",
      category: "2000",
      seeders: 44,
    })
  })

  it("parses Cardigann XML selector results", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(`
<response>
  <results>
    <torrent>
      <title>XML Selector Movie 2026 1080p WEB-DL</title>
      <download href="/download/xml-selector">Download</download>
      <details href="/details/xml-selector">Details</details>
      <category>Movies</category>
      <size>700 MB</size>
      <seeders>19</seeders>
      <leechers>2</leechers>
      <date>2026-05-09T00:00:00.000Z</date>
    </torrent>
  </results>
</response>
`),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 63,
      name: "XML Selector Cardigann",
      type: "cardigann_yaml",
      definitionKey: "xml-selector-cardigann",
      definitionYaml: `
id: xml-selector-cardigann
name: XML Selector Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /api/xml-selector
      response:
        type: xml
      inputs:
        q: "{{ .Keywords }}"
  rows:
    selector: torrent
  fields:
    title:
      selector: title
    download:
      selector: download
      attribute: href
    details:
      selector: details
      attribute: href
    category:
      selector: category
    size:
      selector: size
    seeders:
      selector: seeders
    leechers:
      selector: leechers
    date:
      selector: date
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 25,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "XML Selector Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "XML Selector Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/xml-selector",
      infoUrl: "https://tracker.example/details/xml-selector",
      category: "2000",
      size: 700_000_000,
      seeders: 19,
      leechers: 2,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-09T00:00:00.000Z")
  })

  it("returns no releases for Cardigann response no-results messages", async () => {
    const fetchMock = vi.fn(async () => new Response("NO JSON RESULTS", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 60,
      name: "No Results JSON Cardigann",
      type: "cardigann_yaml",
      definitionKey: "no-results-json-cardigann",
      definitionYaml: `
id: no-results-json-cardigann
name: No Results JSON Cardigann
links:
  - https://tracker.example
caps:
  categorymappings: []
  modes:
    search: [q]
search:
  paths:
    - path: /api/no-results
      response:
        type: json
        noResultsMessage: NO JSON RESULTS
      inputs:
        q: "{{ .Keywords }}"
  rows:
    selector: $.data.results
  fields:
    title:
      selector: title
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 20,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Missing Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toEqual([])
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

  it("builds Nyaa RSS search requests from the built-in definition", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 11,
      name: "Nyaa",
      type: "cardigann_yaml",
      definitionKey: "nyaa",
      baseUrl: "https://nyaa.si",
      apiKey: "",
      priority: 20,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Example Anime", type: "tv", categories: [5070] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.origin).toBe("https://nyaa.si")
    expect(url.pathname).toBe("/")
    expect(url.searchParams.get("page")).toBe("rss")
    expect(url.searchParams.get("q")).toBe("Example Anime")
    expect(url.searchParams.get("f")).toBe("0")
    expect(url.searchParams.get("c")).toBe("0_0")
    expect(releases[0]).toMatchObject({
      title: "Example Movie 2026 1080p WEB-DL",
      indexerId: 11,
      indexerName: "Nyaa",
      indexerPriority: 20,
    })
  })

  it("parses first-pass Cardigann HTML selector results", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(HTML_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 13,
      name: "HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-cardigann",
      definitionYaml: `
id: html-cardigann
name: HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
      inputs:
        q: "{{ .Keywords }}"
        cat: "{{ .Categories }}"
  rows:
    selector: tr.torrent
  fields:
    category:
      selector: a.category
      attribute: href
      filters:
        - name: querystring
          args: cat
    title_default:
      selector: a.short-title
    title:
      selector: a.full-title
      optional: true
      default: "{{ .Result.title_default }}"
    details:
      selector: a.details
      attribute: href
    download:
      selector: a.download
      attribute: href
    size:
      selector: td.size
    seeders:
      selector: td.seeders
    leechers:
      selector: td.leechers
    date:
      selector: time
      attribute: datetime
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Fallback Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.pathname).toBe("/browse")
    expect(url.searchParams.get("q")).toBe("Fallback Movie")
    expect(url.searchParams.get("cat")).toBe("movies")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Fallback Movie 2026 1080p WEB-DL",
      indexerId: 13,
      indexerName: "HTML Cardigann",
      indexerPriority: 35,
      size: 1_610_612_736,
      seeders: 1234,
      leechers: 56,
      downloadUrl: "https://tracker.example/download/1",
      infoUrl: "https://tracker.example/details/1",
      category: "2000",
      protocol: "torrent",
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-01T00:00:00.000Z")
  })

  it("normalizes Cardigann field-name modifiers in HTML selector results", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_FIELD_MODIFIER_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 64,
      name: "Field Modifier HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "field-modifier-html-cardigann",
      definitionYaml: `
id: field-modifier-html-cardigann
name: Field Modifier HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent
  fields:
    title:
      selector: td.title-main
    title|append:
      selector: td.title-extra
    download|optional:
      selector: a.download
      attribute: href
    category:
      selector: td.category
    category|noappend:
      selector: td.category a
      attribute: href
      optional: true
      filters:
        - name: querystring
          args: cat
    seeders:
      selector: td.seeders
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Modifier Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Modifier.Movie.2026.1080p.WEB-DL",
      downloadUrl: "https://tracker.example/download/modifier",
      category: "2000",
      seeders: 17,
      protocol: "torrent",
    })
  })

  it("applies Cardigann relative-time field filters to HTML dates", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_RELATIVE_TIME_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 50,
      name: "Relative Time HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "relative-time-html-cardigann",
      definitionYaml: `
id: relative-time-html-cardigann
name: Relative Time HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent
  fields:
    title:
      selector: a.title
    download:
      selector: a.download
      attribute: href
    size:
      selector: td.size
    date:
      selector: td.date
      filters:
        - name: timeago
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Relative Time Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Relative Time Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/relative",
      age: 2,
    })
  })

  it.each(["dateparse", "timeparse"] as const)(
    "applies Cardigann %s field filters to HTML dates",
    async (filterName) => {
      const fetchMock = vi.fn(async () => new Response(HTML_DATEPARSE_RESULTS, { status: 200 }))
      vi.stubGlobal("fetch", fetchMock)

      const adapter = createCardigannYamlAdapter({
        id: filterName === "dateparse" ? 51 : 52,
        name: "Date Parse HTML Cardigann",
        type: "cardigann_yaml",
        definitionKey: `${filterName}-html-cardigann`,
        definitionYaml: `
id: ${filterName}-html-cardigann
name: Date Parse HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent
  fields:
    title:
      selector: a.title
    download:
      selector: a.download
      attribute: href
    size:
      selector: td.size
    date:
      selector: td.date
      filters:
        - name: ${filterName}
          args: "yyyy-MMM-dd HH:mm:ss zzz"
`,
        baseUrl: "https://tracker.example",
        apiKey: "",
        priority: 35,
        categories: [],
        protocol: "torrent",
      })

      const releases = await Effect.runPromise(
        adapter.search({ term: "Date Parse Movie", type: "general", categories: [2000] }),
      )

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(releases).toHaveLength(1)
      expect(releases[0]).toMatchObject({
        title: "Date Parse Movie 2026 1080p WEB-DL",
        downloadUrl: "https://tracker.example/download/dateparse",
      })
      expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-02T13:45:30.000Z")
    },
  )

  it("applies Cardigann HTML date headers when release rows omit dates", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_DATE_HEADER_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 54,
      name: "Date Header HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "date-header-html-cardigann",
      definitionYaml: `
id: date-header-html-cardigann
name: Date Header HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent
    dateheaders:
      selector: td.date-header
      filters:
        - name: dateparse
          args: "yyyy-MM-dd"
  fields:
    title:
      selector: a.title
    download:
      selector: a.download
      attribute: href
    size:
      selector: td.size
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Header Date Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(3)
    expect(releases[0]).toMatchObject({
      title: "Header Date Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/header-date",
      category: "2000",
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-04T00:00:00.000Z")
    expect(releases[1]?.publishedAt.toISOString()).toBe("2026-05-04T00:00:00.000Z")
    expect(releases[2]?.publishedAt.toISOString()).toBe("2026-05-05T00:00:00.000Z")
  })

  it("applies additional Cardigann field filters to HTML fields", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_FIELD_FILTER_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 55,
      name: "Field Filter HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "field-filter-html-cardigann",
      definitionYaml: `
id: field-filter-html-cardigann
name: Field Filter HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: Movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent
  fields:
    title:
      selector: a.title
      filters:
        - name: diacritics
          args: replace
        - name: validfilename
    download:
      selector: a.download
      attribute: href
    category:
      selector: td.category
      filters:
        - name: validate
          args: "Movies, TV"
    date:
      selector: td.date
      filters:
        - name: fuzzytime
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Creme Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Creme Movie_ 2026_1080p_ WEB-DL",
      downloadUrl: "https://tracker.example/download/filtered",
      category: "2000",
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-06T00:00:00.000Z")
  })

  it("applies Cardigann jsonjoinarray field filters to HTML fields", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_JSON_JOIN_FIELD_FILTER_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 56,
      name: "JSON Join Field Filter HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "json-join-field-filter-html-cardigann",
      definitionYaml: `
id: json-join-field-filter-html-cardigann
name: JSON Join Field Filter HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: Movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent
  fields:
    title:
      selector: td.title-json
      filters:
        - name: jsonjoinarray
          args:
            - $.parts
            - " "
    download:
      selector: a.download
      attribute: href
    category:
      selector: td.category-json
      filters:
        - name: jsonjoinarray
          args:
            - $.categories
            - ", "
    date:
      selector: td.date
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "JSON Join Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "JSON Join Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/json-joined",
      category: "2000",
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-07T00:00:00.000Z")
  })

  it("applies Cardigann andmatch row filters to HTML results", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_ROW_FILTER_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 53,
      name: "Row Filter HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "row-filter-html-cardigann",
      definitionYaml: `
id: row-filter-html-cardigann
name: Row Filter HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent
    filters:
      - name: andmatch
  fields:
    title:
      selector: a.title
    download:
      selector: a.download
      attribute: href
    size:
      selector: td.size
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Wanted Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Wanted Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/wanted",
      category: "2000",
    })
  })

  it("resolves nested Cardigann HTML descendant selectors within their parent matches", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_NESTED_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 26,
      name: "Nested HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "nested-html-cardigann",
      definitionYaml: `
id: nested-html-cardigann
name: Nested HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: table.results tr.torrent
  fields:
    title:
      selector: td.name a
    details:
      selector: td.name a
      attribute: href
    download:
      selector: td.actions a.download
      attribute: href
    size:
      selector: td.stats span.size
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Nested Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Nested Movie 2026 2160p WEB-DL",
      downloadUrl: "https://tracker.example/download/2",
      infoUrl: "https://tracker.example/details/2",
      size: 2_000_000_000,
      category: "2000",
    })
  })

  it("merges Cardigann HTML rows using rows.after before extracting fields", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_AFTER_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 27,
      name: "After Rows HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "after-rows-html-cardigann",
      definitionYaml: `
id: after-rows-html-cardigann
name: After Rows HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: table.results tr
    after: 1
  fields:
    title:
      selector: td.name a
    details:
      selector: td.name a
      attribute: href
    download:
      selector: td.actions a.download
      attribute: href
    size:
      selector: span.size
    date:
      selector: time
      attribute: datetime
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Split Row Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Split Row Movie 2026 1080p BluRay",
      downloadUrl: "https://tracker.example/download/3",
      infoUrl: "https://tracker.example/details/3",
      size: 3_758_096_384,
      category: "2000",
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-03T00:00:00.000Z")
  })

  it("removes Cardigann HTML field descendants before extracting text", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_REMOVE_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 28,
      name: "Remove Selector HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "remove-selector-html-cardigann",
      definitionYaml: `
id: remove-selector-html-cardigann
name: Remove Selector HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent
  fields:
    title:
      selector: td.name a
      remove: span.badge
    details:
      selector: td.name a
      attribute: href
    download:
      selector: td.actions a.download
      attribute: href
    size:
      selector: td.size
    uploadvolumefactor:
      selector: td.name
      case:
        span.badge: "2"
    category:
      case:
        tr.torrent: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Clean Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Clean Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/4",
      infoUrl: "https://tracker.example/details/4",
      size: 4_000_000_000,
      category: "2000",
      uploadFactor: 2,
    })
  })

  it("matches Cardigann HTML field selectors against the current row", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_SELF_SELECTOR_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 29,
      name: "Self Selector HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "self-selector-html-cardigann",
      definitionYaml: `
id: self-selector-html-cardigann
name: Self Selector HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent
  fields:
    title:
      selector: tr.torrent
      attribute: data-title
    details:
      selector: tr.torrent
      attribute: data-details
    download:
      selector: td.actions a.download
      attribute: href
    size:
      selector: td.size
    category:
      selector: tr.torrent
      attribute: data-category
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Self Match Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Self Match Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/5",
      infoUrl: "https://tracker.example/details/5",
      size: 5_000_000_000,
      category: "2000",
    })
  })

  it("builds Cardigann-style POST search requests from definition paths", async () => {
    let requestUrl: string | undefined
    let requestInit: RequestInit | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input)
      requestInit = init
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 10,
      name: "Cardigann POST",
      type: "cardigann_yaml",
      definitionKey: "post-cardigann",
      definitionYaml: `
id: post-cardigann
name: Post Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q, imdbid]
search:
  headers:
    Cookie: "{{ .Config.APIKey }}"
  paths:
    - path: /search
      method: post
      response:
        type: torznab
      inputs:
        apikey: "{{ .Config.APIKey }}"
        t: "{{ .Query.Type }}"
        q: "{{ .Keywords }}"
        cat: "{{ .Categories }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "api-key",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Post Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.pathname).toBe("/search")
    expect(url.search).toBe("")
    expect(requestInit?.method).toBe("POST")

    const headers = new Headers(requestInit?.headers)
    expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded")
    expect(headers.get("cookie")).toBe("api-key")
    const body = new URLSearchParams(String(requestInit?.body))
    expect(body.get("apikey")).toBe("api-key")
    expect(body.get("t")).toBe("movie")
    expect(body.get("q")).toBe("Post Movie")
    expect(body.get("cat")).toBe("movies")
    expect(releases[0]?.title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("executes Cardigann login requests and reuses session cookies for search", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      if (new URL(url).pathname === "/login") {
        return new Response("ok", {
          status: 200,
          headers: { "set-cookie": "session=abc123; Path=/; HttpOnly" },
        })
      }
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 25,
      name: "Login Cardigann",
      type: "cardigann_yaml",
      definitionKey: "login-cardigann",
      definitionYaml: `
id: login-cardigann
name: Login Cardigann
links:
  - https://tracker.example
settings:
  - name: username
    label: Username
  - name: password
    label: Password
    type: password
  - name: landing
    label: Landing cookie
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
login:
  path: /login
  method: post
  cookies:
    - "landing={{ .Config.Landing }}"
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
        landing: "preseed",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Session Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const login = requests[0]
    const search = requests[1]
    expect(new URL(login?.url ?? "").pathname).toBe("/login")
    expect(login?.init?.method).toBe("POST")
    const loginHeaders = new Headers(login?.init?.headers)
    expect(loginHeaders.get("cookie")).toBe("landing=preseed")
    const loginBody = new URLSearchParams(String(login?.init?.body))
    expect(loginBody.get("username")).toBe("alice")
    expect(loginBody.get("password")).toBe("secret")

    expect(new URL(search?.url ?? "").pathname).toBe("/api")
    const searchHeaders = new Headers(search?.init?.headers)
    expect(searchHeaders.get("cookie")).toBe("landing=preseed; session=abc123")
    expect(new URL(search?.url ?? "").searchParams.get("q")).toBe("Session Movie")
    expect(releases[0]?.title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("renders Cardigann cookie-login values into search requests", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 26,
      name: "Cookie Login Cardigann",
      type: "cardigann_yaml",
      definitionKey: "cookie-login-cardigann",
      definitionYaml: `
id: cookie-login-cardigann
name: Cookie Login Cardigann
links:
  - https://tracker.example
settings:
  - name: cookie
    label: Cookie
    type: cookie
  - name: landing
    label: Landing cookie
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
login:
  method: cookie
  cookies:
    - "landing={{ .Config.Landing }}"
  inputs:
    cookie: "{{ .Config.Cookie }}"
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        cookie: "session=abc123; user=alice",
        landing: "preseed",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Cookie Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(new URL(requests[0]?.url ?? "").pathname).toBe("/api")
    const headers = new Headers(requests[0]?.init?.headers)
    expect(headers.get("cookie")).toBe("landing=preseed; session=abc123; user=alice")
    expect(new URL(requests[0]?.url ?? "").searchParams.get("q")).toBe("Cookie Movie")
    expect(releases[0]?.title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("executes Cardigann oneurl login requests before search", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      if (new URL(url).pathname === "/login") {
        return new Response("ok", {
          status: 200,
          headers: { "set-cookie": "oneurl=abc123; Path=/; HttpOnly" },
        })
      }
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 27,
      name: "OneUrl Login Cardigann",
      type: "cardigann_yaml",
      definitionKey: "oneurl-login-cardigann",
      definitionYaml: `
id: oneurl-login-cardigann
name: OneUrl Login Cardigann
links:
  - https://tracker.example
settings:
  - name: token
    label: Token
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
login:
  path: /login
  method: oneurl
  inputs:
    oneurl: "?token={{ .Config.Token }}"
    ignored: "{{ .Config.Token }}"
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        token: "abc123",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "OneUrl Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const loginUrl = new URL(requests[0]?.url ?? "")
    expect(loginUrl.pathname).toBe("/login")
    expect(loginUrl.searchParams.get("token")).toBe("abc123")
    expect(loginUrl.searchParams.has("ignored")).toBe(false)
    expect(requests[0]?.init?.method).toBeUndefined()

    const searchHeaders = new Headers(requests[1]?.init?.headers)
    expect(searchHeaders.get("cookie")).toBe("oneurl=abc123")
    expect(new URL(requests[1]?.url ?? "").searchParams.get("q")).toBe("OneUrl Movie")
    expect(releases[0]?.title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("executes Cardigann form login requests before search", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      const pathname = new URL(url).pathname
      if (pathname === "/login") {
        return new Response(
          `<html><body>
            <form id="signin" action="/ignored">
              <input type="hidden" name="csrf" value="token123">
              <input type="text" name="username" value="landing-user">
              <input type="checkbox" name="remember" value="1" checked>
              <input type="checkbox" name="skip" value="1">
              <input name="disabled" value="nope" disabled>
            </form>
          </body></html>`,
          {
            status: 200,
            headers: { "set-cookie": "landing=abc; Path=/; HttpOnly" },
          },
        )
      }
      if (pathname === "/session") {
        return new Response("ok", {
          status: 200,
          headers: { "set-cookie": "session=xyz; Path=/; HttpOnly" },
        })
      }
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 28,
      name: "Form Login Cardigann",
      type: "cardigann_yaml",
      definitionKey: "form-login-cardigann",
      definitionYaml: `
id: form-login-cardigann
name: Form Login Cardigann
links:
  - https://tracker.example
settings:
  - name: username
    label: Username
  - name: password
    label: Password
    type: password
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
login:
  path: /login
  method: form
  form: form#signin
  submitpath: /session
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Form Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(new URL(requests[0]?.url ?? "").pathname).toBe("/login")

    const submitBody = new URLSearchParams(String(requests[1]?.init?.body ?? ""))
    expect(new URL(requests[1]?.url ?? "").pathname).toBe("/session")
    expect(requests[1]?.init?.method).toBe("POST")
    expect(submitBody.get("csrf")).toBe("token123")
    expect(submitBody.get("username")).toBe("alice")
    expect(submitBody.get("password")).toBe("secret")
    expect(submitBody.get("remember")).toBe("1")
    expect(submitBody.has("skip")).toBe(false)
    expect(submitBody.has("disabled")).toBe(false)

    const submitHeaders = new Headers(requests[1]?.init?.headers)
    expect(submitHeaders.get("cookie")).toBe("landing=abc")

    const searchHeaders = new Headers(requests[2]?.init?.headers)
    expect(searchHeaders.get("cookie")).toBe("landing=abc; session=xyz")
    expect(new URL(requests[2]?.url ?? "").searchParams.get("q")).toBe("Form Movie")
    expect(releases[0]?.title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("executes Cardigann multipart form login requests", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      const pathname = new URL(url).pathname
      if (pathname === "/login") {
        return new Response(
          `<html><body>
            <form id="signin" action="/session" enctype="multipart/form-data">
              <input type="hidden" name="csrf" value="token123">
              <input type="text" name="username" value="landing-user">
              <input type="checkbox" name="remember" value="1" checked>
            </form>
          </body></html>`,
          {
            status: 200,
            headers: { "set-cookie": "landing=abc; Path=/; HttpOnly" },
          },
        )
      }
      if (pathname === "/session") {
        return new Response("ok", {
          status: 200,
          headers: { "set-cookie": "multipart=session; Path=/; HttpOnly" },
        })
      }
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 31,
      name: "Multipart Form Login Cardigann",
      type: "cardigann_yaml",
      definitionKey: "multipart-form-login-cardigann",
      definitionYaml: `
id: multipart-form-login-cardigann
name: Multipart Form Login Cardigann
links:
  - https://tracker.example
settings:
  - name: username
    label: Username
  - name: password
    label: Password
    type: password
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
login:
  path: /login
  method: form
  form: form#signin
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Multipart Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const submitHeaders = new Headers(requests[1]?.init?.headers)
    const contentType = submitHeaders.get("content-type") ?? ""
    const boundary = contentType.match(/^multipart\/form-data; boundary=(.+)$/)?.[1]
    const submitBody = String(requests[1]?.init?.body ?? "")

    expect(new URL(requests[1]?.url ?? "").pathname).toBe("/session")
    expect(requests[1]?.init?.method).toBe("POST")
    expect(boundary).toBeTruthy()
    expect(submitBody).toContain(
      `--${boundary}\r\nContent-Disposition: form-data; name="csrf"\r\n\r\ntoken123`,
    )
    expect(submitBody).toContain(
      `--${boundary}\r\nContent-Disposition: form-data; name="username"\r\n\r\nalice`,
    )
    expect(submitBody).toContain(
      `--${boundary}\r\nContent-Disposition: form-data; name="password"\r\n\r\nsecret`,
    )
    expect(submitBody).toContain(
      `--${boundary}\r\nContent-Disposition: form-data; name="remember"\r\n\r\n1`,
    )
    expect(submitHeaders.get("cookie")).toBe("landing=abc")

    const searchHeaders = new Headers(requests[2]?.init?.headers)
    expect(searchHeaders.get("cookie")).toBe("landing=abc; multipart=session")
    expect(new URL(requests[2]?.url ?? "").searchParams.get("q")).toBe("Multipart Movie")
    expect(releases[0]?.title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("executes Cardigann form login selector inputs", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      const pathname = new URL(url).pathname
      if (pathname === "/login") {
        return new Response(
          `<html><body>
            <span class="csrf">csrf-token</span>
            <input id="ticket-field" value="ticket-123">
            <form id="signin" action="/session?existing=1">
              <input id="username-field" type="text" name="user" value="landing-user">
              <input id="password-field" type="password" name="pass" value="">
            </form>
          </body></html>`,
          { status: 200 },
        )
      }
      if (pathname === "/session") {
        return new Response("ok", {
          status: 200,
          headers: { "set-cookie": "selector=session; Path=/; HttpOnly" },
        })
      }
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 29,
      name: "Form Selector Login Cardigann",
      type: "cardigann_yaml",
      definitionKey: "form-selector-login-cardigann",
      definitionYaml: `
id: form-selector-login-cardigann
name: Form Selector Login Cardigann
links:
  - https://tracker.example
settings:
  - name: username
    label: Username
  - name: password
    label: Password
    type: password
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
login:
  path: /login
  method: form
  form: form#signin
  selectors: true
  inputs:
    "#username-field": "{{ .Config.Username }}"
    "#password-field": "{{ .Config.Password }}"
  selectorinputs:
    csrf:
      selector: span.csrf
  getselectorinputs:
    ticket:
      selector: input#ticket-field
      attribute: value
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Selector Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const submitUrl = new URL(requests[1]?.url ?? "")
    expect(submitUrl.pathname).toBe("/session")
    expect(submitUrl.searchParams.get("existing")).toBe("1")
    expect(submitUrl.searchParams.get("ticket")).toBe("ticket-123")

    const submitBody = new URLSearchParams(String(requests[1]?.init?.body ?? ""))
    expect(submitBody.get("user")).toBe("alice")
    expect(submitBody.get("pass")).toBe("secret")
    expect(submitBody.get("csrf")).toBe("csrf-token")
    expect(submitBody.has("#username-field")).toBe(false)

    const searchHeaders = new Headers(requests[2]?.init?.headers)
    expect(searchHeaders.get("cookie")).toBe("selector=session")
    expect(new URL(requests[2]?.url ?? "").searchParams.get("q")).toBe("Selector Movie")
    expect(releases[0]?.title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("submits configured Cardigann form login captcha responses", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      const pathname = new URL(url).pathname
      if (pathname === "/login") {
        return new Response(
          `<html><body>
            <img class="captcha" src="/captcha.png">
            <form id="signin" action="/session">
              <input id="username-field" type="text" name="user" value="">
              <input id="password-field" type="password" name="pass" value="">
              <input id="captcha-field" type="text" name="captcha_code" value="">
            </form>
          </body></html>`,
          { status: 200 },
        )
      }
      if (pathname === "/session") {
        return new Response("ok", {
          status: 200,
          headers: { "set-cookie": "captcha=session; Path=/; HttpOnly" },
        })
      }
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 32,
      name: "Captcha Form Login Cardigann",
      type: "cardigann_yaml",
      definitionKey: "captcha-form-login-cardigann",
      definitionYaml: `
id: captcha-form-login-cardigann
name: Captcha Form Login Cardigann
links:
  - https://tracker.example
settings:
  - name: username
    label: Username
  - name: password
    label: Password
    type: password
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
login:
  path: /login
  method: form
  form: form#signin
  selectors: true
  inputs:
    "#username-field": "{{ .Config.Username }}"
    "#password-field": "{{ .Config.Password }}"
  captcha:
    type: image
    selector: img.captcha
    input: "#captcha-field"
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
        cardigannCaptcha: "human-answer",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Captcha Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const submitBody = new URLSearchParams(String(requests[1]?.init?.body ?? ""))
    expect(new URL(requests[1]?.url ?? "").pathname).toBe("/session")
    expect(submitBody.get("user")).toBe("alice")
    expect(submitBody.get("pass")).toBe("secret")
    expect(submitBody.get("captcha_code")).toBe("human-answer")

    const searchHeaders = new Headers(requests[2]?.init?.headers)
    expect(searchHeaders.get("cookie")).toBe("captcha=session")
    expect(new URL(requests[2]?.url ?? "").searchParams.get("q")).toBe("Captcha Movie")
    expect(releases[0]?.title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("solves Cardigann simpleCaptcha form logins", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      const pathname = new URL(url).pathname
      if (pathname === "/login") {
        return new Response(
          `<html><body>
            <script src="/js/simpleCaptcha.js"></script>
            <form id="signin" action="/session">
              <input type="text" name="username" value="">
              <input type="password" name="password" value="">
            </form>
          </body></html>`,
          {
            status: 200,
            headers: { "set-cookie": "landing=abc; Path=/; HttpOnly" },
          },
        )
      }
      if (pathname === "/simpleCaptcha.php") {
        return new Response(JSON.stringify({ images: [{ hash: "captcha-hash" }] }), {
          status: 200,
          headers: { "set-cookie": "captcha=seen; Path=/; HttpOnly" },
        })
      }
      if (pathname === "/session") {
        return new Response("ok", {
          status: 200,
          headers: { "set-cookie": "simple=session; Path=/; HttpOnly" },
        })
      }
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 33,
      name: "SimpleCaptcha Form Login Cardigann",
      type: "cardigann_yaml",
      definitionKey: "simple-captcha-form-login-cardigann",
      definitionYaml: `
id: simple-captcha-form-login-cardigann
name: SimpleCaptcha Form Login Cardigann
links:
  - https://tracker.example
settings:
  - name: username
    label: Username
  - name: password
    label: Password
    type: password
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
login:
  path: /login
  method: form
  form: form#signin
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Simple Captcha Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(4)
    const captchaUrl = new URL(requests[1]?.url ?? "")
    expect(captchaUrl.pathname).toBe("/simpleCaptcha.php")
    expect(captchaUrl.searchParams.get("numImages")).toBe("1")
    const captchaHeaders = new Headers(requests[1]?.init?.headers)
    expect(captchaHeaders.get("cookie")).toBe("landing=abc")
    expect(captchaHeaders.get("referer")).toBe("https://tracker.example/login")

    const submitBody = new URLSearchParams(String(requests[2]?.init?.body ?? ""))
    expect(new URL(requests[2]?.url ?? "").pathname).toBe("/session")
    expect(submitBody.get("username")).toBe("alice")
    expect(submitBody.get("password")).toBe("secret")
    expect(submitBody.get("captchaSelection")).toBe("captcha-hash")
    expect(submitBody.get("submitme")).toBe("X")
    const submitHeaders = new Headers(requests[2]?.init?.headers)
    expect(submitHeaders.get("cookie")).toBe("landing=abc; captcha=seen")

    const searchHeaders = new Headers(requests[3]?.init?.headers)
    expect(searchHeaders.get("cookie")).toBe("landing=abc; captcha=seen; simple=session")
    expect(new URL(requests[3]?.url ?? "").searchParams.get("q")).toBe("Simple Captcha Movie")
    expect(releases[0]?.title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("fails Cardigann login when a configured error selector matches", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('<html><body><div class="login-error">Bad credentials</div></body></html>', {
          status: 200,
        }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 30,
      name: "Login Error Cardigann",
      type: "cardigann_yaml",
      definitionKey: "login-error-cardigann",
      definitionYaml: `
id: login-error-cardigann
name: Login Error Cardigann
links:
  - https://tracker.example
settings:
  - name: username
    label: Username
  - name: password
    label: Password
    type: password
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
login:
  path: /login
  method: post
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
  error:
    - selector: div.login-error
      message:
        selector: div.login-error
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "wrong",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const exit = await Effect.runPromiseExit(
      adapter.search({ term: "Denied Movie", type: "movie", categories: [2000] }),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isSuccess(exit)) throw new Error("expected login failure")
    const error = Option.getOrUndefined(Cause.failureOption(exit.cause))
    expect(error).toMatchObject({
      _tag: "IndexerError",
      reason: "auth_failed",
      message: "Bad credentials",
      retryable: false,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("fails Cardigann HTML search when login test selector is missing", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('<html><body><form id="login">Please sign in</form></body></html>', {
          status: 200,
        }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 32,
      name: "Login Test Cardigann",
      type: "cardigann_yaml",
      definitionKey: "login-test-cardigann",
      definitionYaml: `
id: login-test-cardigann
name: Login Test Cardigann
links:
  - https://tracker.example
settings:
  - name: cookie
    label: Cookie
    type: cookie
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    search: [q]
login:
  method: cookie
  inputs:
    cookie: "{{ .Config.Cookie }}"
  test:
    selector: a.logout
search:
  paths:
    - path: /browse
      response:
        type: html
      inputs:
        q: "{{ .Keywords }}"
  rows:
    selector: tr.torrent
  fields:
    title:
      selector: a.title
    download:
      selector: a.download
      attribute: href
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        cookie: "session=expired",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const exit = await Effect.runPromiseExit(
      adapter.search({ term: "Logged Out Movie", type: "general", categories: [2000] }),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isSuccess(exit)) throw new Error("expected login test failure")
    const error = Option.getOrUndefined(Cause.failureOption(exit.cause))
    expect(error).toMatchObject({
      _tag: "IndexerError",
      reason: "auth_failed",
      message: "Cardigann login test failed: selector not found: a.logout",
      retryable: false,
    })
    const requestInit = fetchMock.mock.calls[0]?.[1]
    expect(new Headers(requestInit?.headers).get("cookie")).toBe("session=expired")
  })

  it("applies Cardigann template filters to paths, raw params, and headers", async () => {
    let requestUrl: string | undefined
    let requestInit: RequestInit | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input)
      requestInit = init
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 12,
      name: "Filtered Cardigann",
      type: "cardigann_yaml",
      definitionKey: "filtered-cardigann",
      definitionYaml: `
id: filtered-cardigann
name: Filtered Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q, imdbid]
search:
  paths:
    - path: /search/{{ .Keywords | trim | urlencode }}
      response:
        type: torznab
      headers:
        X-Auth: '{{ .Config.Username }}:{{ .Config.Cookie }}:{{ .Config.APIKey }}'
        X-Header-List:
          - '{{ .Keywords | trim | lowercase }}'
        X-Query-Slug: '{{ .Keywords | trim | lowercase | replace " " "-" }}'
        X-Link-Token: '{{ .Config.Link | querystring "token" }}'
        X-Html-Decoded: '{{ .Config.EncodedTitle | htmldecode }}'
        X-Html-Encoded: '{{ .Config.RawHtml | htmlencode }}'
        X-Url-Decoded: '{{ .Config.EncodedPath | urldecode }}'
        X-Url-Tail: '{{ .Config.EncodedPath | urldecode | split " " -1 }}'
      inputs:
        $raw: 'q={{ .Keywords | trim | urlencode }}&imdb={{ .Query.IMDBIDShort | prepend "tt" }}&cat={{ .Categories | join "," }}&source={{ .Config.Link | querystring "source" }}'
        decoded: '{{ .Config.EncodedTitle | htmldecode }}'
        encoded: '{{ .Config.RawHtml | htmlencode }}'
        urlDecoded: '{{ .Config.EncodedPath | urldecodecomponent }}'
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "api-key",
      configValues: {
        username: "alice",
        cookie: "session=secret",
        link: "browse.php?source=web&token=abc%20123#row",
        encodedTitle: "Anne Rice&#039;s &amp; Co",
        encodedPath: "Encoded%20Name%2BPlus",
        rawHtml: `A & B <C> "D" 'E'`,
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({
        term: " Example Movie ",
        type: "movie",
        categories: [2000],
        imdbId: "tt1234567",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.pathname).toBe("/search/Example%20Movie")
    expect(url.searchParams.get("q")).toBe("Example Movie")
    expect(url.searchParams.get("imdb")).toBe("tt1234567")
    expect(url.searchParams.get("cat")).toBe("movies")
    expect(url.searchParams.get("source")).toBe("web")
    expect(url.searchParams.get("decoded")).toBe("Anne Rice's & Co")
    expect(url.searchParams.get("encoded")).toBe("A &amp; B &lt;C&gt; &quot;D&quot; &#39;E&#39;")
    expect(url.searchParams.get("urlDecoded")).toBe("Encoded Name+Plus")

    const headers = new Headers(requestInit?.headers)
    expect(headers.get("x-auth")).toBe("alice:session=secret:api-key")
    expect(headers.get("x-header-list")).toBe("example movie")
    expect(headers.get("x-query-slug")).toBe("example-movie")
    expect(headers.get("x-link-token")).toBe("abc 123")
    expect(headers.get("x-html-decoded")).toBe("Anne Rice's & Co")
    expect(headers.get("x-html-encoded")).toBe("A &amp; B &lt;C&gt; &quot;D&quot; &#39;E&#39;")
    expect(headers.get("x-url-decoded")).toBe("Encoded Name+Plus")
    expect(headers.get("x-url-tail")).toBe("Name+Plus")
  })

  it("expands Cardigann range templates for repeated category params", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 17,
      name: "Range Cardigann",
      type: "cardigann_yaml",
      definitionKey: "range-cardigann",
      definitionYaml: `
id: range-cardigann
name: Range Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
    - id: tv
      cat: TV
      desc: TV
  modes:
    search: [q]
search:
  paths:
    - path: /search
      response:
        type: torznab
      inputs:
        $raw: '{{ range .Categories }}cat={{ . }}&{{ end }}q={{ .Keywords }}'
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({ term: "Range Search", type: "general", categories: [2000, 5000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.searchParams.getAll("cat")).toEqual(["movies", "tv"])
    expect(url.searchParams.get("q")).toBe("Range Search")
  })

  it("renders Cardigann base template variables", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 19,
      name: "Base Variables Cardigann",
      type: "cardigann_yaml",
      definitionKey: "base-variables-cardigann",
      definitionYaml: `
id: base-variables-cardigann
name: Base Variables Cardigann
links:
  - https://tracker.example/from-definition
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    search: [q]
search:
  paths:
    - path: /search/{{ .Today.Year }}
      response:
        type: torznab
      inputs:
        site: "{{ .Config.sitelink }}"
        truthy: "{{ .True }}"
        falseFallback: '{{ .False | default "fallback" }}'
        offset: "{{ .Query.Offset }}"
        extended: "{{ .Query.Extended }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({ term: "Base Vars", type: "general", offset: 25, extended: "1" }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.pathname).toBe(`/search/${new Date().getFullYear()}`)
    expect(url.searchParams.get("site")).toBe("https://tracker.example/root")
    expect(url.searchParams.get("truthy")).toBe("True")
    expect(url.searchParams.get("falseFallback")).toBe("fallback")
    expect(url.searchParams.get("offset")).toBe("25")
    expect(url.searchParams.get("extended")).toBe("1")
  })

  it("renders Cardigann conditional and function templates", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 20,
      name: "Logic Template Cardigann",
      type: "cardigann_yaml",
      definitionKey: "logic-template-cardigann",
      definitionYaml: `
id: logic-template-cardigann
name: Logic Template Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q, imdbid]
search:
  paths:
    - path: /search
      response:
        type: torznab
      inputs:
        q: '{{ if .Keywords }}{{ .Keywords }}{{ else }}empty{{ end }}'
        short: '{{ if .Query.IMDBID }}{{ .Query.IMDBIDShort }}{{ end }}'
        season: '{{ if .Query.Season }}{{ .Query.Season }}{{ end }}'
        kind: '{{ if eq .Query.Type "movie" }}film{{ else }}other{{ end }}'
        auth: '{{ if and .Config.APIKey .Query.IMDBID }}yes{{ else }}no{{ end }}'
        fallback: '{{ if or .Config.Missing .Query.TMDBID }}has-id{{ else }}none{{ end }}'
        notTv: '{{ if ne .Query.Type "tvsearch" }}yes{{ else }}no{{ end }}'
        replace: '{{ re_replace .Keywords "\\s+" "+" }}'
        cats: '{{ join .Categories "," }}'
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "api-key",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({
        term: "Logic Movie",
        type: "movie",
        categories: [2000],
        imdbId: "tt1234567",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.pathname).toBe("/search")
    expect(url.searchParams.get("q")).toBe("Logic Movie")
    expect(url.searchParams.get("short")).toBe("1234567")
    expect(url.searchParams.has("season")).toBe(false)
    expect(url.searchParams.get("kind")).toBe("film")
    expect(url.searchParams.get("auth")).toBe("yes")
    expect(url.searchParams.get("fallback")).toBe("none")
    expect(url.searchParams.get("notTv")).toBe("yes")
    expect(url.searchParams.get("replace")).toBe("Logic+Movie")
    expect(url.searchParams.get("cats")).toBe("movies")
  })

  it("renders Cardigann checkbox config values as template booleans", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 21,
      name: "Checkbox Config Cardigann",
      type: "cardigann_yaml",
      definitionKey: "checkbox-config-cardigann",
      definitionYaml: `
id: checkbox-config-cardigann
name: Checkbox Config Cardigann
links:
  - https://tracker.example
settings:
  - name: freeleechOnly
    label: Freeleech only
    type: checkbox
  - name: includeDead
    label: Include dead
    type: checkbox
  - name: cookieInfo
    label: Cookie help
    type: info_cookie
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
search:
  paths:
    - path: /search
      response:
        type: torznab
      inputs:
        freeleech: '{{ if .Config.freeleechOnly }}1{{ else }}0{{ end }}'
        dead: '{{ if .Config.includeDead }}1{{ else }}0{{ end }}'
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        freeleechOnly: "true",
        includeDead: "false",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(adapter.search({ term: "Checkbox Movie", type: "movie" }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.searchParams.get("freeleech")).toBe("1")
    expect(url.searchParams.get("dead")).toBe("0")
  })

  it("uses Cardigann auth defaults when config values are omitted", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 23,
      name: "Default Auth Cardigann",
      type: "cardigann_yaml",
      definitionKey: "default-auth-cardigann",
      definitionYaml: `
id: default-auth-cardigann
name: Default Auth Cardigann
links:
  - https://tracker.example
settings:
  - name: mode
    label: Search mode
    type: select
    default: safe
  - name: freeleechOnly
    label: Freeleech only
    type: checkbox
    default: true
  - name: includeDead
    label: Include dead
    type: checkbox
    default: false
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
search:
  paths:
    - path: /search
      response:
        type: torznab
      inputs:
        mode: "{{ .Config.Mode }}"
        freeleech: '{{ if .Config.freeleechOnly }}1{{ else }}0{{ end }}'
        dead: '{{ if .Config.includeDead }}1{{ else }}0{{ end }}'
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(adapter.search({ term: "Default Auth Movie", type: "movie" }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.searchParams.get("mode")).toBe("safe")
    expect(url.searchParams.get("freeleech")).toBe("1")
    expect(url.searchParams.get("dead")).toBe("0")
  })

  it("lets saved Cardigann config values override auth defaults", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 24,
      name: "Saved Auth Cardigann",
      type: "cardigann_yaml",
      definitionKey: "saved-auth-cardigann",
      definitionYaml: `
id: saved-auth-cardigann
name: Saved Auth Cardigann
links:
  - https://tracker.example
settings:
  - name: mode
    label: Search mode
    type: select
    default: safe
  - name: freeleechOnly
    label: Freeleech only
    type: checkbox
    default: true
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
search:
  paths:
    - path: /search
      response:
        type: torznab
      inputs:
        mode: "{{ .Config.mode }}"
        freeleech: '{{ if .Config.FreeleechOnly }}1{{ else }}0{{ end }}'
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        mode: "raw",
        freeleechOnly: "false",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(adapter.search({ term: "Saved Auth Movie", type: "movie" }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.searchParams.get("mode")).toBe("raw")
    expect(url.searchParams.get("freeleech")).toBe("0")
  })

  it("narrows Cardigann Categories for each matching path", async () => {
    const requestUrls: Array<string> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrls.push(String(input))
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 16,
      name: "Path Category Cardigann",
      type: "cardigann_yaml",
      definitionKey: "path-category-cardigann",
      definitionYaml: `
id: path-category-cardigann
name: Path Category Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
    - id: tv
      cat: TV
      desc: TV
  modes:
    search: [q]
search:
  paths:
    - path: /movies
      categories: [movies]
      response:
        type: torznab
      inputs:
        cat: "{{ .Categories | join ',' }}"
    - path: /tv
      categories: [tv]
      response:
        type: torznab
      inputs:
        cat: "{{ .Categories | join ',' }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({ term: "Mixed Category Search", type: "general", categories: [2000, 5000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const requests = requestUrls
      .map((item) => new URL(item))
      .toSorted((left, right) => left.pathname.localeCompare(right.pathname))
    expect(requests.map((url) => `${url.pathname}:${url.searchParams.get("cat")}`)).toEqual([
      "/movies:movies",
      "/tv:tv",
    ])
  })

  it("uses default Cardigann categories when no request categories match", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 18,
      name: "Default Category Cardigann",
      type: "cardigann_yaml",
      definitionKey: "default-category-cardigann",
      definitionYaml: `
id: default-category-cardigann
name: Default Category Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      default: true
    - id: tv
      cat: TV
      desc: TV
  modes:
    search: [q]
search:
  paths:
    - path: /search
      response:
        type: torznab
      inputs:
        cat: "{{ .Categories | join ',' }}"
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({ term: "Default Category Search", type: "general", categories: [7000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.searchParams.get("cat")).toBe("movies")
    expect(url.searchParams.get("q")).toBe("Default Category Search")
  })

  it("deduplicates multi-mapped Cardigann tracker categories in rendered requests", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 19,
      name: "Multi Category Cardigann",
      type: "cardigann_yaml",
      definitionKey: "multi-category-cardigann",
      definitionYaml: `
id: multi-category-cardigann
name: Multi Category Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: media
      cat:
        - Movies
        - TV
      desc: Mixed Media
  modes:
    search: [q]
search:
  paths:
    - path: /search
      response:
        type: torznab
      inputs:
        cat: "{{ .Categories | join ',' }}"
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({
        term: "Mixed Category Search",
        type: "general",
        categories: [2000, 5000],
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.searchParams.get("cat")).toBe("media")
    expect(url.searchParams.get("q")).toBe("Mixed Category Search")
  })

  it("applies Cardigann keyword filters before rendering Keywords", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 15,
      name: "Keyword Filtered Cardigann",
      type: "cardigann_yaml",
      definitionKey: "keyword-filtered-cardigann",
      definitionYaml: `
id: keyword-filtered-cardigann
name: Keyword Filtered Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
search:
  keywordsfilters:
    - name: trim
    - name: urldecodecomponent
    - name: re_replace
      args: ["\\\\s+", "+"]
    - name: split
      args: ["+", "-1"]
    - name: append
      args: "-{{ .Config.Region }}"
    - name: urlencodecomponent
  paths:
    - path: /search/{{ .Keywords }}
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
        raw: "{{ .Query.Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: { region: "AU" },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({ term: "  Keyword%20Filter%20Movie  ", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.pathname).toBe("/search/Movie-AU")
    expect(url.searchParams.get("q")).toBe("Movie-AU")
    expect(url.searchParams.get("raw")).toBe("Keyword Filter Movie")
  })

  it("applies Cardigann querystring and HTML keyword filters before rendering Keywords", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 22,
      name: "Querystring Keyword Cardigann",
      type: "cardigann_yaml",
      definitionKey: "querystring-keyword-cardigann",
      definitionYaml: `
id: querystring-keyword-cardigann
name: Querystring Keyword Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
search:
  keywordsfilters:
    - name: querystring
      args: q
    - name: htmldecode
    - name: htmlencode
  paths:
    - path: /search
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
        decoded: "{{ .Keywords | htmldecode }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({
        term: "browse.php?cat=movies&q=Anne+Rice%26%23039%3Bs+Movie%202026#results",
        type: "movie",
        categories: [2000],
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.searchParams.get("q")).toBe("Anne Rice&#39;s Movie 2026")
    expect(url.searchParams.get("decoded")).toBe("Anne Rice's Movie 2026")
  })

  it("executes single-object Cardigann paths with scalar request inputs", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 13,
      name: "Scalar Cardigann",
      type: "cardigann_yaml",
      definitionKey: "scalar-cardigann",
      definitionYaml: `
id: scalar-cardigann
name: Scalar Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: 1
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
search:
  path:
    path: /single
    categories: [1]
    response:
      type: xml
    inputs:
      t: "{{ .Query.Type }}"
      page: 1
      freeleech: true
      q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({ term: "Scalar Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.pathname).toBe("/single")
    expect(url.searchParams.get("t")).toBe("movie")
    expect(url.searchParams.get("page")).toBe("1")
    expect(url.searchParams.get("freeleech")).toBe("true")
    expect(url.searchParams.get("q")).toBe("Scalar Movie")
  })

  it("skips global Cardigann inputs when a path disables inherited inputs", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 14,
      name: "No Inherited Inputs Cardigann",
      type: "cardigann_yaml",
      definitionKey: "no-inherited-inputs-cardigann",
      definitionYaml: `
id: no-inherited-inputs-cardigann
name: No Inherited Inputs Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
search:
  inputs:
    apikey: "{{ .Config.APIKey }}"
    t: "{{ .Query.Type }}"
  paths:
    - path: /search
      inheritinputs: false
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "api-key",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({ term: "No Inherited Inputs Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.pathname).toBe("/search")
    expect(url.searchParams.get("q")).toBe("No Inherited Inputs Movie")
    expect(url.searchParams.has("apikey")).toBe(false)
    expect(url.searchParams.has("t")).toBe(false)
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
