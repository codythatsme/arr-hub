import { describe, expect, it } from "vitest"

import { ValidationError } from "#/effect/errors"

import { seriesCreateInputFromBody, seriesUpdateInputFromBody } from "./compatSeriesInputs"

describe("compatible series inputs", () => {
  it("parses Sonarr-style create resources into local series input", () => {
    const input = seriesCreateInputFromBody({
      tvdbId: 100,
      tmdbId: "200",
      imdbId: "tt0000100",
      title: " The Example Show ",
      originalTitle: "Example Original",
      year: "2026",
      overview: "Overview",
      remotePoster: "https://image.example/poster.jpg",
      status: "continuing",
      network: "Network",
      genres: ["Drama", " "],
      runtime: "45",
      seriesType: "standard",
      certification: "TV-14",
      rootFolderPath: "/tv",
      monitored: true,
      qualityProfileId: "2",
      seasonFolder: false,
      seasons: [
        { seasonNumber: 0, monitored: false },
        { seasonNumber: 1, monitored: true },
      ],
    })

    expect(input).not.toBeInstanceOf(ValidationError)
    if (input instanceof ValidationError) throw input
    expect(input).toMatchObject({
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
      runtimeMinutes: 45,
      seriesType: "standard",
      certification: "TV-14",
      rootFolderPath: "/tv",
      monitored: true,
      qualityProfileId: 2,
      seasonFolder: false,
      seasons: [
        { seasonNumber: 0, monitored: false },
        { seasonNumber: 1, monitored: true },
      ],
    })
  })

  it("parses update resources and supports nullable fields", () => {
    expect(
      seriesUpdateInputFromBody({
        path: "/tv/Example Show",
        status: "upcoming",
        tmdbId: "0",
        posterPath: null,
        overview: null,
      }),
    ).toEqual({
      overview: null,
      posterPath: null,
      rootFolderPath: "/tv/Example Show",
      status: "continuing",
      tmdbId: null,
    })
  })

  it("rejects incomplete or invalid resources", () => {
    expect(seriesCreateInputFromBody({ title: "Missing TVDB" })).toBeInstanceOf(ValidationError)
    expect(seriesCreateInputFromBody({ tvdbId: 0, title: "Bad TVDB" })).toBeInstanceOf(
      ValidationError,
    )
    expect(seriesUpdateInputFromBody({ status: "deleted" })).toBeInstanceOf(ValidationError)
    expect(seriesUpdateInputFromBody({ seasonFolder: "true" })).toBeInstanceOf(ValidationError)
  })
})
