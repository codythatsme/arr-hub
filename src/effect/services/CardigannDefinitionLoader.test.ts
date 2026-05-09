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
    ])
    expect(BUILT_IN_CARDIGANN_DEFINITIONS[0].capabilities.searchTypes).toEqual(["search", "movie"])
    expect(BUILT_IN_CARDIGANN_DEFINITIONS[1].capabilities.searchTypes).toEqual([
      "search",
      "tvsearch",
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
  inputs:
    apikey: "{{ .Config.APIKey }}"
  paths:
    - path: /api
      categories: [movies]
      response:
        type: torznab
      inputs:
        t: search
        q: "{{ .Keywords }}"
`)

    expect(runtime.search).toEqual({
      allowEmptyInputs: false,
      inputs: { apikey: "{{ .Config.APIKey }}" },
      headers: {},
      paths: [
        {
          path: "/api",
          method: "get",
          inputs: { t: "search", q: "{{ .Keywords }}" },
          headers: {},
          categories: ["movies"],
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
