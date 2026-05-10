import { describe, expect, it } from "vitest"

import { downloadClientResource } from "./compatDownloadClientResources"

describe("compatible download client resources", () => {
  it("maps local download clients to Arr-style provider resources", () => {
    const createdAt = new Date("2026-01-02T03:04:05.000Z")

    expect(
      downloadClientResource({
        id: 3,
        name: "qBittorrent",
        type: "qbittorrent",
        host: "qb.local",
        port: 8080,
        username: "admin",
        useSsl: true,
        category: "arr-hub",
        tags: ["torrent"],
        priority: 20,
        enabled: true,
        settings: {
          pollIntervalMs: 5000,
          addPaused: true,
          removeCompletedDownloads: true,
          removeFailedDownloads: false,
        },
        createdAt,
        updatedAt: createdAt,
        health: null,
      }),
    ).toMatchObject({
      id: 3,
      name: "qBittorrent",
      implementation: "QBittorrent",
      configContract: "QBittorrentSettings",
      enable: true,
      protocol: "torrent",
      priority: 20,
      removeCompletedDownloads: true,
      removeFailedDownloads: false,
      categories: [{ clientCategory: "arr-hub", categories: [] }],
      supportsCategories: true,
      tags: [],
      fields: expect.arrayContaining([
        expect.objectContaining({ name: "host", value: "qb.local" }),
        expect.objectContaining({ name: "port", value: 8080 }),
        expect.objectContaining({ name: "username", value: "admin" }),
        expect.objectContaining({ name: "password", value: "********", privacy: "password" }),
        expect.objectContaining({ name: "useSsl", value: true }),
        expect.objectContaining({ name: "category", value: "arr-hub" }),
        expect.objectContaining({ name: "addPaused", value: true }),
        expect.objectContaining({ name: "removeCompletedDownloads", value: true }),
        expect.objectContaining({ name: "removeFailedDownloads", value: false }),
      ]),
    })
  })
})
