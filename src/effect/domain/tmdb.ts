/** TMDB API response types — parsed at boundary, used throughout. */

export interface TmdbMovie {
  readonly id: number
  readonly title: string
  readonly originalTitle: string
  readonly overview: string
  readonly releaseDate: string | null
  readonly year: number | null
  readonly posterPath: string | null
  readonly backdropPath: string | null
  readonly popularity: number
  readonly voteAverage: number
  readonly voteCount: number
  readonly genreIds: ReadonlyArray<number>
  readonly originalLanguage: string
}

export interface TmdbMovieDetails extends TmdbMovie {
  readonly imdbId: string | null
  readonly runtime: number | null
  readonly status: string
  readonly tagline: string | null
  readonly genres: ReadonlyArray<{ readonly id: number; readonly name: string }>
  readonly productionCompanies: ReadonlyArray<{
    readonly id: number
    readonly name: string
    readonly logoPath: string | null
    readonly originCountry: string
  }>
  readonly budget: number
  readonly revenue: number
}

export interface TmdbSearchResult {
  readonly page: number
  readonly totalPages: number
  readonly totalResults: number
  readonly results: ReadonlyArray<TmdbMovie>
}

export interface TmdbTvSeries {
  readonly id: number
  readonly name: string
  readonly originalName: string
  readonly overview: string
  readonly firstAirDate: string | null
  readonly year: number | null
  readonly posterPath: string | null
  readonly backdropPath: string | null
  readonly popularity: number
  readonly voteAverage: number
  readonly voteCount: number
  readonly genreIds: ReadonlyArray<number>
  readonly originalLanguage: string
  readonly originCountry: ReadonlyArray<string>
}

export interface TmdbTvNetwork {
  readonly id: number
  readonly name: string
  readonly logoPath: string | null
  readonly originCountry: string
}

export interface TmdbTvSeasonSummary {
  readonly id: number
  readonly seasonNumber: number
  readonly episodeCount: number
  readonly name: string
  readonly overview: string
  readonly airDate: string | null
  readonly posterPath: string | null
}

export interface TmdbTvSeriesDetails extends TmdbTvSeries {
  readonly tvdbId: number | null
  readonly imdbId: string | null
  readonly status: string
  readonly type: string
  readonly genres: ReadonlyArray<{ readonly id: number; readonly name: string }>
  readonly networks: ReadonlyArray<TmdbTvNetwork>
  readonly episodeRunTime: ReadonlyArray<number>
  readonly seasons: ReadonlyArray<TmdbTvSeasonSummary>
}

export interface TmdbTvEpisode {
  readonly id: number
  readonly title: string
  readonly overview: string
  readonly seasonNumber: number
  readonly episodeNumber: number
  readonly airDate: string | null
  readonly stillPath: string | null
  readonly runtime: number | null
  readonly voteAverage: number
  readonly voteCount: number
}

export interface TmdbTvSeason {
  readonly id: number
  readonly seasonNumber: number
  readonly name: string
  readonly overview: string
  readonly airDate: string | null
  readonly posterPath: string | null
  readonly episodes: ReadonlyArray<TmdbTvEpisode>
}

export interface TmdbTvSearchResult {
  readonly page: number
  readonly totalPages: number
  readonly totalResults: number
  readonly results: ReadonlyArray<TmdbTvSeries>
}

/** TMDB image base URL — poster/backdrop paths get appended to this. */
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p" as const

export type TmdbImageSize = "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "original"

export function tmdbImageUrl(path: string, size: TmdbImageSize = "w500"): string {
  return `${TMDB_IMAGE_BASE}/${size}${path}`
}
