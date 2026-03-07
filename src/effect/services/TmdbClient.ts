import { Context, Effect, Layer } from "effect"

import { env } from "#/env"

import type { TmdbMovie, TmdbMovieDetails, TmdbSearchResult } from "../domain/tmdb"
import { MetadataError, type MetadataErrorReason } from "../errors"

// ── Service tag ──

export class TmdbClient extends Context.Tag("@arr-hub/TmdbClient")<
  TmdbClient,
  {
    readonly searchMovies: (
      query: string,
      page?: number,
    ) => Effect.Effect<TmdbSearchResult, MetadataError>
    readonly getMovie: (tmdbId: number) => Effect.Effect<TmdbMovieDetails, MetadataError>
    readonly getPopular: (page?: number) => Effect.Effect<TmdbSearchResult, MetadataError>
    readonly getTrending: (
      timeWindow?: "day" | "week",
    ) => Effect.Effect<TmdbSearchResult, MetadataError>
  }
>() {}

// ── Constants ──

const BASE_URL = "https://api.themoviedb.org/3"
const PROVIDER = "tmdb"

// ── Helpers ──

function buildUrl(
  path: string,
  apiKey: string,
  params: Record<string, string | number | undefined>,
): URL {
  const url = new URL(`${BASE_URL}${path}`)
  url.searchParams.set("api_key", apiKey)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v))
  }
  return url
}

function statusToReason(status: number): MetadataErrorReason {
  if (status === 401) return "api_key_missing"
  if (status === 404) return "not_found"
  if (status === 429) return "rate_limited"
  return "request_failed"
}

function statusRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

function getStatusFromError(e: unknown): number | undefined {
  if (typeof e === "object" && e !== null && "status" in e) {
    const obj: { status: unknown } = e
    return typeof obj.status === "number" ? obj.status : undefined
  }
  return undefined
}

function fetchJson(url: URL): Effect.Effect<unknown, MetadataError> {
  return Effect.tryPromise({
    try: async () => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15_000)
      try {
        const res = await fetch(url.toString(), { signal: controller.signal })
        if (!res.ok) {
          throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
        }
        return (await res.json()) as unknown
      } finally {
        clearTimeout(timeout)
      }
    },
    catch: (e) => {
      if (e instanceof Error && e.name === "AbortError") {
        return new MetadataError({
          provider: PROVIDER,
          reason: "request_failed",
          message: "request timed out after 15s",
          retryable: true,
        })
      }
      const status = getStatusFromError(e)
      if (status !== undefined) {
        return new MetadataError({
          provider: PROVIDER,
          reason: statusToReason(status),
          message: `HTTP ${status}`,
          retryable: statusRetryable(status),
        })
      }
      return new MetadataError({
        provider: PROVIDER,
        reason: "request_failed",
        message: e instanceof Error ? e.message : "unknown error",
        retryable: false,
      })
    },
  })
}

// ── Response parsing ──

type Rec = Readonly<Record<string, unknown>>

const EMPTY_REC: Rec = Object.freeze({})

/** Safely coerce unknown JSON value to a string-keyed record. Allocation-free for objects. */
function toRec(obj: unknown): Rec {
  if (typeof obj !== "object" || obj === null) return EMPTY_REC
  // JSON.parse always returns plain objects with string keys, so Object.entries is safe.
  return Object.fromEntries(Object.entries(obj))
}

function extractYear(releaseDate: unknown): number | null {
  if (typeof releaseDate !== "string" || releaseDate.length < 4) return null
  const parsed = Number.parseInt(releaseDate.slice(0, 4), 10)
  return Number.isNaN(parsed) ? null : parsed
}

function toStr(val: unknown): string {
  return typeof val === "string" ? val : ""
}

function toStrOrNull(val: unknown): string | null {
  return typeof val === "string" && val.length > 0 ? val : null
}

function toNum(val: unknown, fallback: number): number {
  return typeof val === "number" ? val : fallback
}

function toNumOrNull(val: unknown): number | null {
  return typeof val === "number" ? val : null
}

function toArray(val: unknown): ReadonlyArray<unknown> {
  return Array.isArray(val) ? val : []
}

function parseMovie(raw: unknown): TmdbMovie {
  const r = toRec(raw)
  const releaseDate = toStrOrNull(r["release_date"])
  return {
    id: toNum(r["id"], 0),
    title: toStr(r["title"]),
    originalTitle: toStr(r["original_title"]),
    overview: toStr(r["overview"]),
    releaseDate,
    year: extractYear(r["release_date"]),
    posterPath: toStrOrNull(r["poster_path"]),
    backdropPath: toStrOrNull(r["backdrop_path"]),
    popularity: toNum(r["popularity"], 0),
    voteAverage: toNum(r["vote_average"], 0),
    voteCount: toNum(r["vote_count"], 0),
    genreIds: toArray(r["genre_ids"]).filter((v): v is number => typeof v === "number"),
    originalLanguage: toStr(r["original_language"]),
  }
}

function parseSearchResult(raw: unknown): TmdbSearchResult {
  const r = toRec(raw)
  return {
    page: toNum(r["page"], 1),
    totalPages: toNum(r["total_pages"], 1),
    totalResults: toNum(r["total_results"], 0),
    results: toArray(r["results"]).map(parseMovie),
  }
}

function parseMovieDetails(raw: unknown): TmdbMovieDetails {
  const base = parseMovie(raw)
  const r = toRec(raw)
  const genres = toArray(r["genres"]).map((g) => {
    const gr = toRec(g)
    return { id: toNum(gr["id"], 0), name: toStr(gr["name"]) }
  })
  const productionCompanies = toArray(r["production_companies"]).map((c) => {
    const cr = toRec(c)
    return {
      id: toNum(cr["id"], 0),
      name: toStr(cr["name"]),
      logoPath: toStrOrNull(cr["logo_path"]),
      originCountry: toStr(cr["origin_country"]),
    }
  })
  return {
    ...base,
    imdbId: toStrOrNull(r["imdb_id"]),
    runtime: toNumOrNull(r["runtime"]),
    status: toStr(r["status"]),
    tagline: toStrOrNull(r["tagline"]),
    genres,
    productionCompanies,
    budget: toNum(r["budget"], 0),
    revenue: toNum(r["revenue"], 0),
  }
}

// ── Live implementation ──

export const TmdbClientLive = Layer.succeed(TmdbClient, {
  searchMovies: (query, page) =>
    Effect.gen(function* () {
      const apiKey = yield* requireApiKey()
      const url = buildUrl("/search/movie", apiKey, { query, page })
      const json = yield* fetchJson(url)
      return parseSearchResult(json)
    }),

  getMovie: (tmdbId) =>
    Effect.gen(function* () {
      const apiKey = yield* requireApiKey()
      const url = buildUrl(`/movie/${tmdbId}`, apiKey, {})
      const json = yield* fetchJson(url)
      return parseMovieDetails(json)
    }),

  getPopular: (page) =>
    Effect.gen(function* () {
      const apiKey = yield* requireApiKey()
      const url = buildUrl("/movie/popular", apiKey, { page })
      const json = yield* fetchJson(url)
      return parseSearchResult(json)
    }),

  getTrending: (timeWindow) =>
    Effect.gen(function* () {
      const apiKey = yield* requireApiKey()
      const window = timeWindow ?? "week"
      const url = buildUrl(`/trending/movie/${window}`, apiKey, {})
      const json = yield* fetchJson(url)
      return parseSearchResult(json)
    }),
})

function requireApiKey(): Effect.Effect<string, MetadataError> {
  const key = env.TMDB_API_KEY
  if (key === undefined || key.length === 0) {
    return Effect.fail(
      new MetadataError({
        provider: PROVIDER,
        reason: "api_key_missing",
        message: "TMDB_API_KEY not configured",
        retryable: false,
      }),
    )
  }
  return Effect.succeed(key)
}
