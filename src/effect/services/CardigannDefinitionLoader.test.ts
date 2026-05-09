import { describe, expect, it } from "@effect/vitest"

import {
  BUILT_IN_CARDIGANN_DEFINITIONS,
  getBuiltInCardigannRuntimeDefinition,
  parseCardigannDefinitionYaml,
  parseCardigannRuntimeDefinitionYaml,
} from "./CardigannDefinitionLoader"

describe("CardigannDefinitionLoader", () => {
  it("parses Cardigann-style YAML into indexer definition seeds", () => {
    const definition = parseCardigannDefinitionYaml(`
id: example-cardigann
name: Example Cardigann
description: Example private tracker
type: semi-private
links:
  - https://tracker.example
version: fixture-1
tags:
  - movies
settings:
  - name: passkey
    label: Passkey
    type: input
    required: true
    helpText: Account passkey
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
    - id: tv-hd
      cat: TV/HD
      desc: TV HD
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep]
`)

    expect(definition).toMatchObject({
      definitionKey: "example-cardigann",
      displayName: "Example Cardigann",
      protocol: "torrent",
      implementation: "cardigann_yaml",
      baseUrl: "https://tracker.example",
      privacy: "semi_private",
      supportsRss: true,
      supportsSearch: true,
      tags: ["movies"],
      version: "fixture-1",
    })
    expect(definition.authFields).toEqual([
      {
        name: "passkey",
        label: "Passkey",
        type: "text",
        required: true,
        helpText: "Account passkey",
      },
    ])
    expect(definition.categories).toEqual([
      { trackerCategory: "movies", trackerCategoryDesc: "Movies", newznabCategory: 2000 },
      { trackerCategory: "tv-hd", trackerCategoryDesc: "TV HD", newznabCategory: 5040 },
    ])
    expect(definition.capabilities).toEqual({
      searchTypes: ["search", "movie", "tvsearch"],
      categories: [
        { id: 2000, name: "Movies" },
        { id: 5040, name: "TV HD" },
      ],
    })
  })

  it("loads the built-in curated fixture definitions", () => {
    expect(BUILT_IN_CARDIGANN_DEFINITIONS.map((definition) => definition.definitionKey)).toEqual([
      "public-domain-movie-torrents",
      "open-tv-torrents",
      "nyaa",
      "animetosho",
      "morethantv",
      "torrent-network",
    ])
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find(
        (definition) => definition.definitionKey === "public-domain-movie-torrents",
      )?.capabilities.searchTypes,
    ).toEqual(["search", "movie"])
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "nyaa")
        ?.capabilities,
    ).toEqual({
      searchTypes: ["search", "tvsearch"],
      categories: [
        { id: 5070, name: "Anime English-translated" },
        { id: 5070, name: "Anime Raw" },
      ],
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "animetosho")
        ?.baseUrl,
    ).toBe("https://feed.animetosho.org")
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "morethantv")
        ?.authFields,
    ).toEqual([
      {
        name: "apiKey",
        label: "API key",
        type: "password",
        required: true,
        helpText: "MoreThanTV Torznab API key.",
      },
    ])
  })

  it("parses Cardigann select auth fields with options and defaults", () => {
    const definition = parseCardigannDefinitionYaml(`
id: select-auth-cardigann
name: Select Auth Cardigann
links:
  - https://tracker.example
settings:
  - name: mode
    label: Search mode
    type: select
    required: true
    default: safe
    options:
      - value: safe
        label: Safe search
      - id: raw
        name: Raw search
      - 10
  - name: region
    label: Region
    type: select
    options:
      us: United States
      eu: Europe
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
`)

    expect(definition.authFields[0]).toMatchObject({
      name: "mode",
      label: "Search mode",
      type: "select",
      required: true,
      defaultValue: "safe",
      options: [
        { value: "safe", label: "Safe search" },
        { value: "raw", label: "Raw search" },
        { value: "10", label: "10" },
      ],
    })
    expect(definition.authFields[1]).toMatchObject({
      name: "region",
      label: "Region",
      type: "select",
      required: false,
      options: [
        { value: "us", label: "United States" },
        { value: "eu", label: "Europe" },
      ],
    })
  })

  it("parses Cardigann caps category dictionaries with standard category names", () => {
    const definition = parseCardigannDefinitionYaml(`
id: caps-category-dictionary
name: Caps Category Dictionary
links:
  - https://tracker.example
caps:
  categories:
    1: Movies/BluRay
    tv-hd: TV/HD
    anime: TV/Anime
  modes:
    search: [q]
`)

    expect(definition.categories).toEqual([
      { trackerCategory: "1", trackerCategoryDesc: "Movies/BluRay", newznabCategory: 2050 },
      { trackerCategory: "tv-hd", trackerCategoryDesc: "TV/HD", newznabCategory: 5040 },
      { trackerCategory: "anime", trackerCategoryDesc: "TV/Anime", newznabCategory: 5070 },
    ])
    expect(definition.capabilities.categories).toEqual([
      { id: 2050, name: "Movies/BluRay" },
      { id: 5040, name: "TV/HD" },
      { id: 5070, name: "TV/Anime" },
    ])
  })

  it("parses default Cardigann category mappings", () => {
    const definition = parseCardigannDefinitionYaml(`
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
`)

    expect(definition.categories).toEqual([
      {
        trackerCategory: "movies",
        trackerCategoryDesc: "Movies",
        newznabCategory: 2000,
        defaultCategory: true,
      },
      { trackerCategory: "tv", trackerCategoryDesc: "TV", newznabCategory: 5000 },
    ])
  })

  it("parses first-pass Cardigann search runtime metadata", () => {
    const runtime = parseCardigannRuntimeDefinitionYaml(`
id: runtime-cardigann
name: Runtime Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    search: [q]
search:
  keywordsfilters:
    - name: trim
    - name: re_replace
      args: ["\\\\s+", "+"]
  inputs:
    apikey: "{{ .Config.APIKey }}"
  paths:
    - path: /api
      categories: [movies]
      inheritinputs: false
      response:
        type: torznab
      inputs:
        t: search
        q: "{{ .Keywords }}"
`)

    expect(runtime.search).toEqual({
      allowEmptyInputs: false,
      keywordFilters: [
        { name: "trim", args: [] },
        { name: "re_replace", args: ["\\s+", "+"] },
      ],
      inputs: { apikey: "{{ .Config.APIKey }}" },
      headers: {},
      paths: [
        {
          path: "/api",
          method: "get",
          inheritInputs: false,
          inputs: { t: "search", q: "{{ .Keywords }}" },
          headers: {},
          categories: ["movies"],
          responseType: "torznab",
        },
      ],
    })
  })

  it("normalizes scalar Cardigann search inputs and single path objects", () => {
    const runtime = parseCardigannRuntimeDefinitionYaml(`
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
    search: [q]
search:
  inputs:
    page: 1
    freeleech: true
  path:
    path: /api
    categories: [1]
    response:
      type: xml
    inputs:
      t: search
      limit: 100
`)

    expect(runtime.search).toEqual({
      allowEmptyInputs: false,
      keywordFilters: [],
      inputs: { page: "1", freeleech: "true" },
      headers: {},
      paths: [
        {
          path: "/api",
          method: "get",
          inheritInputs: true,
          inputs: { t: "search", limit: "100" },
          headers: {},
          categories: ["1"],
          responseType: "torznab",
        },
      ],
    })
  })

  it("parses Cardigann request header templates", () => {
    const runtime = parseCardigannRuntimeDefinitionYaml(`
id: header-cardigann
name: Header Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
search:
  headers:
    Cookie: "{{ .Config.APIKey }}"
  paths:
    - path: /api
      headers:
        X-Requested-With: XMLHttpRequest
`)

    expect(runtime.search.headers).toEqual({ Cookie: "{{ .Config.APIKey }}" })
    expect(runtime.search.paths[0]?.headers).toEqual({ "X-Requested-With": "XMLHttpRequest" })
  })

  it("exposes built-in runtime definitions by key", () => {
    const runtime = getBuiltInCardigannRuntimeDefinition("public-domain-movie-torrents")
    expect(runtime?.search.paths[0]).toMatchObject({
      path: "/api",
      responseType: "torznab",
    })
  })

  it("rejects unsupported protocols", () => {
    expect(() =>
      parseCardigannDefinitionYaml(`
id: bad-protocol
name: Bad Protocol
protocol: ed2k
caps:
  categorymappings:
    - id: movies
      cat: Movies
`),
    ).toThrow("unsupported indexer protocol")
  })

  it("rejects categories without a known newznab mapping", () => {
    expect(() =>
      parseCardigannDefinitionYaml(`
id: bad-category
name: Bad Category
caps:
  categorymappings:
    - id: mystery
      cat: Mystery
`),
    ).toThrow("category must include a known cat or newznab category")
  })
})
