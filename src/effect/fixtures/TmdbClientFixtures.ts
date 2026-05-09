import { Effect, Layer } from "effect"

import type {
  TmdbMovie,
  TmdbMovieDetails,
  TmdbTvSearchResult,
  TmdbTvSeason,
  TmdbTvSeriesDetails,
} from "../domain/tmdb"
import { MetadataError } from "../errors"
import { TmdbClient } from "../services/TmdbClient"

export const E2E_TMDB_MOVIE_ID = 990001
export const E2E_TMDB_SERIES_ID = 990002

const PROVIDER = "tmdb"

const E2E_MOVIE: TmdbMovie = {
  id: E2E_TMDB_MOVIE_ID,
  title: "E2E Fixture Movie",
  originalTitle: "E2E Fixture Movie",
  overview: "A deterministic movie returned only for browser smoke tests.",
  releaseDate: "2026-05-09",
  year: 2026,
  posterPath: null,
  backdropPath: null,
  popularity: 1,
  voteAverage: 7,
  voteCount: 1,
  genreIds: [],
  originalLanguage: "en",
}

const E2E_MOVIE_DETAILS: TmdbMovieDetails = {
  ...E2E_MOVIE,
  imdbId: "tt990001",
  runtime: 90,
  status: "Released",
  tagline: null,
  genres: [],
  productionCompanies: [],
  budget: 0,
  revenue: 0,
}

const E2E_TV_SERIES: TmdbTvSeriesDetails = {
  id: E2E_TMDB_SERIES_ID,
  tvdbId: E2E_TMDB_SERIES_ID,
  imdbId: "tt990002",
  name: "E2E Fixture Series",
  originalName: "E2E Fixture Series",
  overview: "A deterministic series returned only for browser smoke tests.",
  firstAirDate: "2026-05-09",
  year: 2026,
  posterPath: null,
  backdropPath: null,
  popularity: 1,
  voteAverage: 8,
  voteCount: 1,
  genreIds: [],
  originalLanguage: "en",
  originCountry: ["US"],
  status: "Returning Series",
  type: "Scripted",
  genres: [],
  networks: [
    {
      id: 990,
      name: "E2E Network",
      logoPath: null,
      originCountry: "US",
    },
  ],
  episodeRunTime: [45],
  seasons: [
    {
      id: 990201,
      seasonNumber: 1,
      episodeCount: 2,
      name: "Season 1",
      overview: "Fixture season.",
      airDate: "2026-05-09",
      posterPath: null,
    },
  ],
}

const E2E_TV_SEASON: TmdbTvSeason = {
  id: 990201,
  seasonNumber: 1,
  name: "Season 1",
  overview: "Fixture season.",
  airDate: "2026-05-09",
  posterPath: null,
  episodes: [
    {
      id: 9902001,
      title: "Pilot",
      overview: "Fixture pilot.",
      seasonNumber: 1,
      episodeNumber: 1,
      airDate: "2026-05-09",
      stillPath: null,
      runtime: 45,
      voteAverage: 8,
      voteCount: 1,
    },
    {
      id: 9902002,
      title: "Second",
      overview: "Fixture second episode.",
      seasonNumber: 1,
      episodeNumber: 2,
      airDate: "2026-05-16",
      stillPath: null,
      runtime: 45,
      voteAverage: 8,
      voteCount: 1,
    },
  ],
}

function notFound(id: number): MetadataError {
  return new MetadataError({
    provider: PROVIDER,
    reason: "not_found",
    message: `TMDB fixture ${id} not found`,
    retryable: false,
  })
}

export const TmdbClientE2EFixtures = Layer.succeed(TmdbClient, {
  searchMovies: (query, page) =>
    Effect.succeed({
      page: page ?? 1,
      totalPages: 1,
      totalResults: 1,
      results: [{ ...E2E_MOVIE, title: `${E2E_MOVIE.title}: ${query}` }],
    }),

  getMovie: (tmdbId) =>
    tmdbId === E2E_MOVIE.id ? Effect.succeed(E2E_MOVIE_DETAILS) : Effect.fail(notFound(tmdbId)),

  getPopular: (page) =>
    Effect.succeed({
      page: page ?? 1,
      totalPages: 1,
      totalResults: 1,
      results: [E2E_MOVIE],
    }),

  getTrending: () =>
    Effect.succeed({ page: 1, totalPages: 1, totalResults: 1, results: [E2E_MOVIE] }),

  searchTvSeries: (query, page): Effect.Effect<TmdbTvSearchResult> =>
    Effect.succeed({
      page: page ?? 1,
      totalPages: 1,
      totalResults: 1,
      results: [{ ...E2E_TV_SERIES, name: `${E2E_TV_SERIES.name}: ${query}` }],
    }),

  getTvSeries: (tmdbId) =>
    tmdbId === E2E_TV_SERIES.id ? Effect.succeed(E2E_TV_SERIES) : Effect.fail(notFound(tmdbId)),

  getTvSeason: (tmdbId, seasonNumber) =>
    tmdbId === E2E_TV_SERIES.id
      ? Effect.succeed({ ...E2E_TV_SEASON, seasonNumber })
      : Effect.fail(notFound(tmdbId)),
})
