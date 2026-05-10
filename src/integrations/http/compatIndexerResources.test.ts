import { describe, expect, it } from "vitest"

import { indexerResource } from "./compatIndexerResources"

describe("compatible indexer resources", () => {
  it("maps local indexers to Arr-style provider resources", () => {
    const createdAt = new Date("2026-01-02T03:04:05.000Z")

    expect(
      indexerResource({
        id: 7,
        name: "Primary Usenet",
        type: "newznab",
        definitionKey: "nzbgeek",
        baseUrl: "https://api.nzbgeek.info",
        proxyId: null,
        enabled: true,
        searchEnabled: true,
        rssEnabled: false,
        priority: 25,
        minimumSeeders: null,
        queryCooldownSeconds: null,
        queryLimitCount: null,
        queryLimitWindowSeconds: null,
        grabLimitCount: null,
        grabLimitWindowSeconds: null,
        categories: [2000, 5000],
        tags: ["usenet"],
        capabilities: {
          searchTypes: ["search", "movie"],
          categories: [{ id: 2000, name: "Movies" }],
        },
        createdAt,
        updatedAt: createdAt,
        health: {
          status: "unhealthy",
          lastCheck: createdAt,
          errorMessage: "auth_failed: bad key",
          responseTimeMs: 120,
        },
      }),
    ).toMatchObject({
      id: 7,
      name: "Primary Usenet",
      implementation: "Newznab",
      configContract: "NewznabSettings",
      enable: true,
      enableRss: false,
      enableAutomaticSearch: true,
      supportsSearch: true,
      protocol: "usenet",
      priority: 25,
      redirect: true,
      supportsRedirect: true,
      appProfileId: 1,
      tags: [],
      capabilities: {
        categories: [{ id: 2000, name: "Movies", subCategories: [] }],
        supportsRawSearch: true,
        movieSearchParams: ["q", "imdbid", "tmdbid"],
      },
      fields: [
        expect.objectContaining({ name: "baseUrl", value: "https://api.nzbgeek.info" }),
        expect.objectContaining({ name: "apiKey", value: "********", privacy: "password" }),
        expect.objectContaining({ name: "categories", value: [2000, 5000] }),
        expect.objectContaining({ name: "minimumSeeders", value: null }),
        expect.objectContaining({ name: "definitionKey", value: "nzbgeek" }),
      ],
      status: {
        indexerId: 7,
        disabledTill: null,
        mostRecentFailure: createdAt,
        initialFailure: createdAt,
      },
    })
  })
})
