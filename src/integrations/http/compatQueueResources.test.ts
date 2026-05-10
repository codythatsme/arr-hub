import { describe, expect, it } from "vitest"

import type { QueueItem } from "#/effect/services/QueueService"

import {
  protocolForDownloadClientType,
  queuePagingResource,
  queueResource,
  queueStatusResource,
} from "./compatQueueResources"

const baseItem: QueueItem = {
  id: 1,
  externalId: "download-1",
  title: "Example.Movie.2026.1080p",
  status: "downloading",
  sizeBytes: 1_000,
  progress: 0.25,
  etaSeconds: 3661,
  errorMessage: null,
  outputPath: "/downloads/example",
  addedAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:10:00.000Z"),
  downloadClient: {
    id: 2,
    name: "qbit",
    type: "qbittorrent",
  },
  media: {
    type: "movie",
    id: 5,
    title: "Example Movie",
    episodeIds: null,
  },
}

describe("compatible queue resources", () => {
  it("maps local queue items to Arr-style queue resources", () => {
    expect(queueResource(baseItem)).toMatchObject({
      id: 1,
      movieId: 5,
      seriesId: null,
      episodeId: null,
      size: 1_000,
      title: "Example.Movie.2026.1080p",
      estimatedCompletionTime: "2026-01-01T01:11:01.000Z",
      added: "2026-01-01T00:00:00.000Z",
      status: "downloading",
      trackedDownloadStatus: "ok",
      trackedDownloadState: "downloading",
      downloadId: "download-1",
      protocol: "torrent",
      downloadClient: "qbit",
      outputPath: "/downloads/example",
      sizeleft: 750,
      timeleft: "1:01:01",
    })
  })

  it("maps series queue items and importing state", () => {
    const resource = queueResource({
      ...baseItem,
      status: "importing",
      media: {
        type: "series",
        id: 7,
        title: "Example Show",
        episodeIds: [11, 12],
      },
      downloadClient: {
        id: 3,
        name: "sab",
        type: "sabnzbd",
      },
    })

    expect(resource).toMatchObject({
      movieId: null,
      seriesId: 7,
      episodeId: 11,
      status: "completed",
      trackedDownloadStatus: "warning",
      trackedDownloadState: "importing",
      protocol: "usenet",
    })
  })

  it("builds paged queue responses using upstream paging field names", () => {
    const response = queuePagingResource(
      [
        baseItem,
        {
          ...baseItem,
          id: 2,
          title: "Another.Movie.2026.2160p",
          sizeBytes: 2_000,
        },
      ],
      { page: 1, pageSize: 1, sortKey: "size", sortDirection: "descending" },
    )

    expect(response).toMatchObject({
      page: 1,
      pageSize: 1,
      sortKey: "size",
      sortDirection: "descending",
      totalRecords: 2,
      records: [{ id: 2, size: 2_000 }],
    })
  })

  it("summarizes queue status counts and error flags", () => {
    const status = queueStatusResource([
      baseItem,
      {
        ...baseItem,
        id: 2,
        status: "failed",
        errorMessage: "client error",
        media: {
          type: "unlinked",
          id: null,
          title: "Unlinked",
          episodeIds: null,
        },
      },
    ])

    expect(status).toEqual({
      id: 0,
      totalCount: 2,
      count: 1,
      unknownCount: 1,
      errors: false,
      warnings: false,
      unknownErrors: true,
      unknownWarnings: false,
    })
  })

  it("maps known download client types to Arr protocols", () => {
    expect(protocolForDownloadClientType("transmission")).toBe("torrent")
    expect(protocolForDownloadClientType("nzbget")).toBe("usenet")
    expect(protocolForDownloadClientType("plugin-client")).toBe("unknown")
  })
})
