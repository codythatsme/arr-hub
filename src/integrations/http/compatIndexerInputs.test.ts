import { describe, expect, it } from "vitest"

import { ValidationError } from "#/effect/errors"

import { indexerCreateInputFromBody, indexerUpdateInputFromBody } from "./compatIndexerInputs"

describe("compatible indexer inputs", () => {
  it("parses Arr-style indexer resources into local create input", () => {
    expect(
      indexerCreateInputFromBody({
        name: "NZBGeek",
        implementation: "Newznab",
        enable: true,
        enableRss: false,
        enableAutomaticSearch: true,
        priority: "10",
        fields: [
          { name: "baseUrl", value: "https://api.nzbgeek.info" },
          { name: "apiKey", value: "secret" },
          { name: "categories", value: "2000,5000" },
        ],
      }),
    ).toEqual({
      name: "NZBGeek",
      type: "newznab",
      baseUrl: "https://api.nzbgeek.info",
      apiKey: "secret",
      enabled: true,
      rssEnabled: false,
      searchEnabled: true,
      priority: 10,
      categories: [2000, 5000],
    })
  })

  it("parses updates without treating masked secrets as new API keys", () => {
    expect(
      indexerUpdateInputFromBody({
        name: "Primary",
        implementation: "Torznab",
        fields: [
          { name: "baseUrl", value: "https://indexer.example" },
          { name: "apiKey", value: "********" },
          { name: "minimumSeeders", value: 5 },
        ],
      }),
    ).toEqual({
      name: "Primary",
      type: "torznab",
      baseUrl: "https://indexer.example",
      minimumSeeders: 5,
    })
  })

  it("rejects incomplete or invalid create resources", () => {
    expect(indexerCreateInputFromBody({ name: "Missing implementation" })).toBeInstanceOf(
      ValidationError,
    )
    expect(
      indexerCreateInputFromBody({
        name: "Bad URL",
        implementation: "Torznab",
        apiKey: "secret",
        baseUrl: "not-a-url",
      }),
    ).toBeInstanceOf(ValidationError)
    expect(
      indexerCreateInputFromBody({
        name: "Bad categories",
        implementation: "Torznab",
        apiKey: "secret",
        baseUrl: "https://indexer.example",
        categories: ["abc"],
      }),
    ).toBeInstanceOf(ValidationError)
  })
})
