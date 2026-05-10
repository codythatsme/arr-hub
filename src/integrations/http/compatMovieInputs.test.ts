import { describe, expect, it } from "vitest"

import { ValidationError } from "#/effect/errors"

import { movieCreateInputFromBody, movieUpdateInputFromBody } from "./compatMovieInputs"

describe("compatible movie inputs", () => {
  it("parses Radarr-style create resources into local movie input", () => {
    const input = movieCreateInputFromBody({
      tmdbId: 100,
      imdbId: "tt0000100",
      title: " The Example Movie ",
      originalTitle: "Example Original",
      year: "2026",
      releaseDate: "2026-01-02",
      overview: "Overview",
      remotePoster: "https://image.example/poster.jpg",
      genres: ["Drama", " "],
      runtime: "123",
      qualityProfileId: "2",
      rootFolderPath: "/movies",
      monitored: false,
    })

    expect(input).not.toBeInstanceOf(ValidationError)
    if (input instanceof ValidationError) throw input
    expect(input).toMatchObject({
      tmdbId: 100,
      imdbId: "tt0000100",
      title: "The Example Movie",
      originalTitle: "Example Original",
      year: 2026,
      overview: "Overview",
      posterPath: "https://image.example/poster.jpg",
      genres: ["Drama"],
      runtimeMinutes: 123,
      qualityProfileId: 2,
      rootFolderPath: "/movies",
      monitored: false,
    })
    expect(input.releaseDate).toEqual(new Date("2026-01-02"))
  })

  it("parses update resources and supports clearing nullable fields", () => {
    expect(
      movieUpdateInputFromBody({
        path: "/movies/Example Movie",
        status: "available",
        posterPath: null,
        overview: null,
      }),
    ).toEqual({
      overview: null,
      posterPath: null,
      rootFolderPath: "/movies/Example Movie",
      status: "available",
    })
  })

  it("rejects incomplete or invalid resources", () => {
    expect(movieCreateInputFromBody({ title: "Missing TMDB" })).toBeInstanceOf(ValidationError)
    expect(movieCreateInputFromBody({ tmdbId: 0, title: "Bad TMDB" })).toBeInstanceOf(
      ValidationError,
    )
    expect(movieUpdateInputFromBody({ status: "deleted" })).toBeInstanceOf(ValidationError)
    expect(movieUpdateInputFromBody({ monitored: "true" })).toBeInstanceOf(ValidationError)
  })
})
