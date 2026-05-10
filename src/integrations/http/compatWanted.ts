import { and, eq, or } from "drizzle-orm"
import { Effect } from "effect"

import { episodes, movies, qualityProfiles, seasons, series } from "#/db/schema"
import { Db } from "#/effect/services/Db"
import type { CalendarEpisode } from "#/effect/services/SeriesService"
import { runAuthedJson } from "#/integrations/http/effect"

import {
  movieResource,
  pagingResource,
  wantedEpisodeResource,
  type CompatibleMovieResource,
  type CompatibleWantedEpisodeResource,
} from "./compatWantedResources"

interface RouteHandlerArgs {
  readonly request: Request
}

type MovieRow = typeof movies.$inferSelect
type QualityProfileRow = typeof qualityProfiles.$inferSelect

type WantedMode = "movie" | "episode"

interface WantedQuery {
  readonly mode: WantedMode
  readonly page: number
  readonly pageSize: number
  readonly sortKey: string
  readonly sortDirection: "ascending" | "descending"
  readonly monitored: boolean
  readonly includeSeries: boolean
}

export function wantedMissingHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const query = wantedQueryFromRequest(request, "missing")
  if (query instanceof Response) return query

  if (query.mode === "episode") return runAuthedJson(request, missingEpisodesEffect(query))
  return runAuthedJson(request, missingMoviesEffect(query))
}

export function wantedCutoffHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const query = wantedQueryFromRequest(request, "cutoff")
  if (query instanceof Response) return query

  if (query.mode === "episode") return runAuthedJson(request, cutoffEpisodesEffect(query))
  return runAuthedJson(request, cutoffMoviesEffect(query))
}

function missingMoviesEffect(query: WantedQuery) {
  return Effect.gen(function* () {
    const db = yield* Db
    const rows = yield* db
      .select()
      .from(movies)
      .where(and(eq(movies.hasFile, false), eq(movies.monitored, query.monitored)))
    return moviePaging(rows, query)
  })
}

function cutoffMoviesEffect(query: WantedQuery) {
  return Effect.gen(function* () {
    const db = yield* Db
    const [movieRows, profileRows] = yield* Effect.all([
      db.select().from(movies).where(eq(movies.hasFile, true)),
      db.select().from(qualityProfiles),
    ])
    const profileById = new Map(profileRows.map((profile) => [profile.id, profile]))
    const rows = movieRows.filter(
      (movie) =>
        movie.monitored === query.monitored &&
        movieCutoffUnmet(movie, profileById.get(movie.qualityProfileId ?? -1)),
    )
    return moviePaging(rows, query)
  })
}

function missingEpisodesEffect(query: WantedQuery) {
  return Effect.gen(function* () {
    const db = yield* Db
    const rows = yield* db
      .select()
      .from(episodes)
      .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
      .innerJoin(series, eq(seasons.seriesId, series.id))
      .where(
        and(
          eq(episodes.hasFile, false),
          query.monitored
            ? and(
                eq(episodes.monitored, true),
                eq(seasons.monitored, true),
                eq(series.monitored, true),
              )
            : or(
                eq(episodes.monitored, false),
                eq(seasons.monitored, false),
                eq(series.monitored, false),
              ),
        ),
      )
    return episodePaging(rows.map(episodeRow), query)
  })
}

function cutoffEpisodesEffect(query: WantedQuery) {
  return Effect.gen(function* () {
    const db = yield* Db
    const [episodeRows, profileRows] = yield* Effect.all([
      db
        .select()
        .from(episodes)
        .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
        .innerJoin(series, eq(seasons.seriesId, series.id))
        .where(eq(episodes.hasFile, true)),
      db.select().from(qualityProfiles),
    ])
    const profileById = new Map(profileRows.map((profile) => [profile.id, profile]))
    const rows = episodeRows
      .map(episodeRow)
      .filter(
        (row) =>
          monitoredMatches(row, query.monitored) &&
          episodeCutoffUnmet(row, profileById.get(row.series.qualityProfileId ?? -1)),
      )
    return episodePaging(rows, query)
  })
}

function moviePaging(rows: ReadonlyArray<MovieRow>, query: WantedQuery) {
  const sorted = rows.toSorted(movieComparator(query.sortKey, query.sortDirection))
  const pageRows = slicePage(sorted, query)
  return pagingResource<CompatibleMovieResource>({
    records: pageRows.map(movieResource),
    totalRecords: sorted.length,
    page: query.page,
    pageSize: query.pageSize,
    sortKey: query.sortKey,
    sortDirection: query.sortDirection,
  })
}

function episodePaging(rows: ReadonlyArray<CalendarEpisode>, query: WantedQuery) {
  const sorted = rows.toSorted(episodeComparator(query.sortKey, query.sortDirection))
  const pageRows = slicePage(sorted, query)
  return pagingResource<CompatibleWantedEpisodeResource>({
    records: pageRows.map((row) =>
      wantedEpisodeResource(row, { includeSeries: query.includeSeries }),
    ),
    totalRecords: sorted.length,
    page: query.page,
    pageSize: query.pageSize,
    sortKey: query.sortKey,
    sortDirection: query.sortDirection,
  })
}

function movieCutoffUnmet(movie: MovieRow, profile: QualityProfileRow | undefined): boolean {
  if (!profile?.upgradeAllowed || profile.cutoffFormatScore <= 0) return false
  return (movie.existingFormatScore ?? Number.NEGATIVE_INFINITY) < profile.cutoffFormatScore
}

function episodeCutoffUnmet(row: CalendarEpisode, profile: QualityProfileRow | undefined): boolean {
  if (!profile?.upgradeAllowed || profile.cutoffFormatScore <= 0) return false
  return (row.episode.existingFormatScore ?? Number.NEGATIVE_INFINITY) < profile.cutoffFormatScore
}

function monitoredMatches(row: CalendarEpisode, monitored: boolean): boolean {
  const allMonitored = row.episode.monitored && row.season.monitored && row.series.monitored
  return monitored ? allMonitored : !allMonitored
}

function episodeRow(row: {
  readonly episodes: typeof episodes.$inferSelect
  readonly seasons: typeof seasons.$inferSelect
  readonly series: typeof series.$inferSelect
}): CalendarEpisode {
  return {
    episode: row.episodes,
    season: row.seasons,
    series: row.series,
  }
}

function slicePage<T>(rows: ReadonlyArray<T>, query: WantedQuery): ReadonlyArray<T> {
  const start = (query.page - 1) * query.pageSize
  return rows.slice(start, start + query.pageSize)
}

function movieComparator(sortKey: string, direction: "ascending" | "descending") {
  return (left: MovieRow, right: MovieRow) =>
    compareValues(movieSortValue(left, sortKey), movieSortValue(right, sortKey), direction)
}

function episodeComparator(sortKey: string, direction: "ascending" | "descending") {
  return (left: CalendarEpisode, right: CalendarEpisode) =>
    compareValues(episodeSortValue(left, sortKey), episodeSortValue(right, sortKey), direction)
}

function movieSortValue(movie: MovieRow, sortKey: string): string | number {
  switch (normalizeSortKey(sortKey)) {
    case "year":
    case "moviemetadatayear":
      return movie.year ?? 0
    case "releasedate":
    case "incinemas":
    case "digitalrelease":
    case "physicalrelease":
      return movie.releaseDate?.getTime() ?? 0
    case "added":
      return movie.addedAt.getTime()
    default:
      return movie.title.toLocaleLowerCase("en-US")
  }
}

function episodeSortValue(row: CalendarEpisode, sortKey: string): string | number {
  switch (normalizeSortKey(sortKey)) {
    case "series":
    case "seriessorttitle":
      return row.series.title.toLocaleLowerCase("en-US")
    case "seasonnumber":
      return row.season.seasonNumber
    case "episodenumber":
      return row.episode.episodeNumber
    case "airdate":
    case "airdateutc":
    case "episodesairdateutc":
      return row.episode.airDate?.getTime() ?? 0
    default:
      return row.episode.airDate?.getTime() ?? 0
  }
}

function compareValues(
  left: string | number,
  right: string | number,
  direction: "ascending" | "descending",
): number {
  const result =
    typeof left === "string" && typeof right === "string"
      ? left.localeCompare(right)
      : Number(left) - Number(right)
  return direction === "ascending" ? result : -result
}

function wantedQueryFromRequest(
  request: Request,
  endpoint: "missing" | "cutoff",
): WantedQuery | Response {
  const params = new URL(request.url).searchParams
  const page = positiveIntegerParam(params, "page", 1)
  if (page instanceof Response) return page
  const pageSize = positiveIntegerParam(params, "pageSize", 20)
  if (pageSize instanceof Response) return pageSize
  const sortDirection = sortDirectionParam(params)
  if (sortDirection instanceof Response) return sortDirection
  const monitored = boolParam(params, "monitored", true)
  if (monitored instanceof Response) return monitored
  const includeSeries = boolParam(params, "includeSeries", false)
  if (includeSeries instanceof Response) return includeSeries
  const mode = wantedMode(params)
  if (mode instanceof Response) return mode

  return {
    mode,
    page,
    pageSize,
    sortKey: params.get("sortKey")?.trim() || defaultSortKey(mode, endpoint),
    sortDirection,
    monitored,
    includeSeries,
  }
}

function wantedMode(params: URLSearchParams): WantedMode | Response {
  const mediaType = params.get("mediaType")?.trim().toLowerCase()
  if (mediaType === "movie" || mediaType === "episode") return mediaType
  if (mediaType)
    return Response.json({ error: "mediaType must be movie or episode" }, { status: 400 })

  if (
    params.has("includeSeries") ||
    params.has("includeImages") ||
    params.has("includeEpisodeFile") ||
    params.has("seriesId")
  ) {
    return "episode"
  }
  return "movie"
}

function defaultSortKey(mode: WantedMode, endpoint: "missing" | "cutoff"): string {
  if (mode === "episode") return "airDateUtc"
  return endpoint === "missing" ? "sortTitle" : "sortTitle"
}

function validateCompatibleVersion(request: Request): Response | null {
  const version = new URL(request.url).pathname.split("/")[2]
  if (version === "v1" || version === "v3") return null
  return Response.json({ error: "unsupported api version" }, { status: 404 })
}

function positiveIntegerParam(
  params: URLSearchParams,
  name: string,
  fallback: number,
): number | Response {
  const value = params.get(name)
  if (value === null || value.trim().length === 0) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return Response.json({ error: `${name} must be a positive integer` }, { status: 400 })
  }
  return parsed
}

function sortDirectionParam(params: URLSearchParams): "ascending" | "descending" | Response {
  const value = params.get("sortDirection")
  if (value === null || value.trim().length === 0) return "ascending"
  if (value === "ascending" || value === "descending") return value
  return Response.json({ error: "sortDirection must be ascending or descending" }, { status: 400 })
}

function boolParam(params: URLSearchParams, name: string, fallback: boolean): boolean | Response {
  const value = params.get(name)
  if (value === null || value.trim().length === 0) return fallback
  if (value === "true" || value === "1") return true
  if (value === "false" || value === "0") return false
  return Response.json({ error: `${name} must be a boolean` }, { status: 400 })
}

function normalizeSortKey(sortKey: string): string {
  return sortKey.replaceAll(/[^a-z0-9]/gi, "").toLowerCase()
}
