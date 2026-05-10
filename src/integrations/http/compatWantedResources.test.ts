import { describe, expect, it } from "vitest"

import type { CalendarEpisode } from "#/effect/services/SeriesService"

import { movieResource, pagingResource, wantedEpisodeResource } from "./compatWantedResources"

const movie = {
  id: 1,
  tmdbId: 100,
  imdbId: "tt0000100",
  title: "The Example Movie",
  originalTitle: "Example Original",
  year: 2026,
  releaseDate: new Date("2026-01-02T00:00:00.000Z"),
  overview: "Overview",
  posterPath: "https://image.example/poster.jpg",
  genres: ["Drama"],
  runtimeMinutes: 123,
  qualityProfileId: 2,
  rootFolderPath: "/movies/Example",
  monitored: true,
  hasFile: false,
  addedAt: new Date("2026-01-01T00:00:00.000Z"),
}

const episode: CalendarEpisode = {
  episode: {
    id: 10,
    seasonId: 20,
    tvdbId: 30,
    tmdbId: null,
    title: "Pilot",
    episodeNumber: 1,
    absoluteEpisodeNumber: null,
    airDate: new Date("2026-01-03T04:05:06.000Z"),
    overview: "Episode overview",
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
  season: {
    id: 20,
    seriesId: 40,
    tmdbId: null,
    seasonNumber: 1,
    monitored: true,
  },
  series: {
    id: 40,
    tvdbId: 50,
    tmdbId: 60,
    imdbId: "tt0000050",
    title: "Example Show",
    originalTitle: null,
    year: 2026,
    overview: "Series overview",
    posterPath: null,
    status: "continuing",
    network: "Network",
    genres: ["Drama"],
    tags: [],
    runtimeMinutes: 45,
    seriesType: "standard",
    certification: null,
    rootFolderPath: "/tv/Example Show",
    monitored: true,
    qualityProfileId: 2,
    seasonFolder: true,
    metadataRefreshedAt: null,
    addedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
}

describe("compatible wanted resources", () => {
  it("maps local movies to first-pass Radarr movie resources", () => {
    expect(movieResource(movie)).toMatchObject({
      id: 1,
      tmdbId: 100,
      title: "The Example Movie",
      sortTitle: "example movie",
      status: "released",
      releaseDate: "2026-01-02T00:00:00.000Z",
      hasFile: false,
      movieFileId: 0,
      qualityProfileId: 2,
      monitored: true,
      runtime: 123,
      cleanTitle: "theexamplemovie",
      titleSlug: "the-example-movie",
      rootFolderPath: "/movies/Example",
    })
  })

  it("maps local episodes to first-pass Sonarr episode resources", () => {
    expect(wantedEpisodeResource(episode, { includeSeries: true })).toMatchObject({
      id: 10,
      seriesId: 40,
      tvdbId: 30,
      episodeFileId: 0,
      seasonNumber: 1,
      episodeNumber: 1,
      title: "Pilot",
      airDateUtc: "2026-01-03T04:05:06.000Z",
      hasFile: false,
      monitored: true,
      series: {
        id: 40,
        title: "Example Show",
      },
    })
  })

  it("builds Arr-style paging responses", () => {
    expect(
      pagingResource({
        records: [movieResource(movie)],
        totalRecords: 3,
        page: 2,
        pageSize: 1,
        sortKey: "sortTitle",
        sortDirection: "ascending",
      }),
    ).toMatchObject({
      page: 2,
      pageSize: 1,
      sortKey: "sortTitle",
      sortDirection: "ascending",
      totalRecords: 3,
      records: [{ id: 1 }],
    })
  })
})
