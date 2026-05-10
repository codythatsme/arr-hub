import { describe, expect, it } from "vitest"

import type { DomainHistoryRow } from "#/effect/services/OperationalHistoryService"

import {
  compatibleHistoryEventType,
  historyPagingResource,
  historyResource,
  localHistoryEventTypes,
} from "./compatHistoryResources"

const baseRow: DomainHistoryRow = {
  id: 1,
  eventType: "grabbed",
  mediaKind: "movie",
  movieId: 10,
  seriesId: null,
  seasonId: null,
  episodeId: null,
  releaseDecisionId: null,
  releaseTitle: "Example.Movie.2026.1080p",
  indexerId: 2,
  indexerName: "Indexer",
  downloadClientId: 3,
  downloadClientName: "qbit",
  downloadExternalId: "download-1",
  schedulerJobId: null,
  notificationDeliveryId: null,
  title: "Grabbed Example",
  message: "Release grabbed",
  metadata: {
    category: "Movies",
    apiKey: "secret-key",
    nested: { score: 42 },
  },
  createdAt: new Date("2026-01-02T03:04:05.000Z"),
}

describe("compatible history resources", () => {
  it("maps local domain history to Arr-style history resources", () => {
    expect(historyResource(baseRow)).toMatchObject({
      id: 1,
      movieId: 10,
      episodeId: null,
      seriesId: null,
      sourceTitle: "Example.Movie.2026.1080p",
      date: "2026-01-02T03:04:05.000Z",
      downloadId: "download-1",
      eventType: "grabbed",
      data: {
        message: "Release grabbed",
        mediaKind: "movie",
        indexer: "Indexer",
        downloadClient: "qbit",
        releaseTitle: "Example.Movie.2026.1080p",
        category: "Movies",
        apiKey: "[redacted]",
        nested: '{"score":42}',
      },
      movie: null,
      episode: null,
      series: null,
    })
  })

  it("uses Sonarr/Radarr history event names from local event types", () => {
    expect(compatibleHistoryEventType({ ...baseRow, eventType: "imported" })).toBe(
      "downloadFolderImported",
    )
    expect(compatibleHistoryEventType({ ...baseRow, eventType: "deleted" })).toBe(
      "movieFileDeleted",
    )
    expect(
      compatibleHistoryEventType({
        ...baseRow,
        eventType: "renamed",
        mediaKind: "episode",
        movieId: null,
        seriesId: 20,
        episodeId: 30,
      }),
    ).toBe("episodeFileRenamed")
  })

  it("maps compatible event filters back to local event types", () => {
    expect(localHistoryEventTypes("grabbed")).toEqual(["grabbed"])
    expect(localHistoryEventTypes("4")).toEqual(["download_failed", "import_failed"])
    expect(localHistoryEventTypes("6")).toEqual(["deleted", "renamed"])
    expect(localHistoryEventTypes("7")).toEqual(["imported", "blocklisted"])
    expect(localHistoryEventTypes("downloadIgnored")).toEqual(["blocklisted"])
    expect(localHistoryEventTypes("nope")).toBeNull()
  })

  it("builds upstream-style paged history responses", () => {
    expect(
      historyPagingResource({
        rows: [baseRow],
        totalRecords: 3,
        page: 2,
        pageSize: 1,
      }),
    ).toMatchObject({
      page: 2,
      pageSize: 1,
      sortKey: "date",
      sortDirection: "descending",
      totalRecords: 3,
      records: [{ id: 1, eventType: "grabbed" }],
    })
  })
})
