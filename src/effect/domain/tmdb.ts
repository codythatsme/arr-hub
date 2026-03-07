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

/** TMDB image base URL — poster/backdrop paths get appended to this. */
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p" as const

export type TmdbImageSize = "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "original"

export function tmdbImageUrl(path: string, size: TmdbImageSize = "w500"): string {
  return `${TMDB_IMAGE_BASE}/${size}${path}`
}
