import { describe, expect, it } from "vitest"

import type { SeriesWithDetails } from "#/effect/services/SeriesService"

import { seriesResource } from "./compatSeriesResources"

const details: SeriesWithDetails = {
  series: {
    id: 1,
    tvdbId: 100,
    tmdbId: 200,
    imdbId: "tt0000100",
    title: "The Example Show",
    originalTitle: "Example Original",
    year: 2026,
    overview: "Overview",
    posterPath: "https://image.example/poster.jpg",
    status: "continuing",
    network: "Network",
    genres: ["Drama"],
    tags: [],
    runtimeMinutes: 45,
    seriesType: "standard",
    certification: "TV-14",
    rootFolderPath: "/tv/Example Show",
    monitored: true,
    qualityProfileId: 2,
    seasonFolder: true,
    metadataRefreshedAt: null,
    addedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  seasons: [
    {
      season: { id: 10, seriesId: 1, tmdbId: null, seasonNumber: 1, monitored: true },
      episodeCount: 2,
      availableCount: 1,
      episodes: [
        {
          id: 20,
          seasonId: 10,
          tvdbId: 1001,
          tmdbId: null,
          title: "Pilot",
          episodeNumber: 1,
          absoluteEpisodeNumber: null,
          airDate: new Date("2025-01-01T00:00:00.000Z"),
          overview: null,
          runtimeMinutes: 45,
          hasFile: true,
          filePath: "/tv/Example Show/S01E01.mkv",
          monitored: true,
          existingQualityName: "WEBDL-1080p",
          existingQualityRank: 3,
          existingFormatScore: 0,
          existingRevisionVersion: 1,
          existingRevisionReal: 0,
          existingReleaseGroup: null,
        },
        {
          id: 21,
          seasonId: 10,
          tvdbId: 1002,
          tmdbId: null,
          title: "Second",
          episodeNumber: 2,
          absoluteEpisodeNumber: null,
          airDate: new Date("2027-01-01T00:00:00.000Z"),
          overview: null,
          runtimeMinutes: 45,
          hasFile: false,
          filePath: null,
          monitored: true,
          existingQualityName: null,
          existingQualityRank: null,
          existingFormatScore: null,
          existingRevisionVersion: 1,
          existingRevisionReal: 0,
          existingReleaseGroup: null,
        },
      ],
    },
  ],
}

describe("compatible series resources", () => {
  it("maps local series details to a first-pass Sonarr series resource", () => {
    expect(seriesResource(details)).toMatchObject({
      id: 1,
      tvdbId: 100,
      tmdbId: 200,
      title: "The Example Show",
      sortTitle: "example show",
      status: "continuing",
      ended: false,
      remotePoster: "https://image.example/poster.jpg",
      qualityProfileId: 2,
      seasonFolder: true,
      monitored: true,
      runtime: 45,
      cleanTitle: "theexampleshow",
      titleSlug: "the-example-show",
      rootFolderPath: "/tv/Example Show",
      seasons: [
        {
          seasonNumber: 1,
          monitored: true,
          statistics: {
            episodeFileCount: 1,
            episodeCount: 2,
            totalEpisodeCount: 2,
            percentOfEpisodes: 50,
          },
        },
      ],
      statistics: {
        seasonCount: 1,
        episodeFileCount: 1,
        episodeCount: 2,
        totalEpisodeCount: 2,
        percentOfEpisodes: 50,
      },
    })
  })
})
