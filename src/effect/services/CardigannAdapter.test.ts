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
    expect(url.pathname).toBe("/search/Keyword%2BFilter%2BMovie-AU")
    expect(url.searchParams.get("q")).toBe("Keyword+Filter+Movie-AU")
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
