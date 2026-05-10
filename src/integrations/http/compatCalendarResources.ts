import type { CalendarEpisode } from "#/effect/services/SeriesService"

export interface CompatibleCalendarEpisodeResource {
  readonly id: number
  readonly seriesId: number
  readonly tvdbId: number
  readonly episodeFileId: number
  readonly seasonNumber: number
  readonly episodeNumber: number
  readonly title: string
  readonly airDate: string | null
  readonly airDateUtc: string | null
  readonly lastSearchTime: string | null
  readonly runtime: number
  readonly finaleType: string | null
  readonly overview: string | null
  readonly episodeFile: null
  readonly hasFile: boolean
  readonly monitored: boolean
  readonly absoluteEpisodeNumber: number | null
  readonly sceneAbsoluteEpisodeNumber: number | null
  readonly sceneEpisodeNumber: number | null
  readonly sceneSeasonNumber: number | null
  readonly unverifiedSceneNumbering: boolean
  readonly endTime: string | null
  readonly grabDate: string | null
  readonly series: CompatibleCalendarSeriesResource | null
  readonly images: ReadonlyArray<unknown>
}

export interface CompatibleCalendarSeriesResource {
  readonly id: number
  readonly title: string
  readonly sortTitle: string
  readonly status: string
  readonly overview: string | null
  readonly network: string | null
  readonly airTime: string | null
  readonly images: ReadonlyArray<unknown>
  readonly remotePoster: string | null
  readonly seasons: ReadonlyArray<unknown>
  readonly year: number | null
  readonly path: string | null
  readonly qualityProfileId: number | null
  readonly seasonFolder: boolean
  readonly monitored: boolean
  readonly monitorNewItems: string
  readonly useSceneNumbering: boolean
  readonly runtime: number
  readonly tvdbId: number
  readonly tvRageId: number
  readonly tvMazeId: number
  readonly tmdbId: number | null
  readonly firstAired: string | null
  readonly lastAired: string | null
  readonly seriesType: string
  readonly cleanTitle: string
  readonly imdbId: string | null
  readonly titleSlug: string
  readonly rootFolderPath: string | null
  readonly folder: string | null
  readonly certification: string | null
  readonly genres: ReadonlyArray<string>
  readonly tags: ReadonlyArray<number>
  readonly added: string | null
  readonly ratings: {
    readonly votes: number
    readonly value: number
  }
}

export function calendarEpisodeResource(
  row: CalendarEpisode,
  options: { readonly includeSeries?: boolean } = {},
): CompatibleCalendarEpisodeResource {
  const runtime = row.episode.runtimeMinutes ?? row.series.runtimeMinutes ?? 0
  const airDateUtc = row.episode.airDate ? row.episode.airDate.toISOString() : null

  return {
    id: row.episode.id,
    seriesId: row.series.id,
    tvdbId: row.episode.tvdbId,
    episodeFileId: row.episode.hasFile ? row.episode.id : 0,
    seasonNumber: row.season.seasonNumber,
    episodeNumber: row.episode.episodeNumber,
    title: row.episode.title,
    airDate: dateOnly(row.episode.airDate),
    airDateUtc,
    lastSearchTime: null,
    runtime,
    finaleType: null,
    overview: row.episode.overview,
    episodeFile: null,
    hasFile: row.episode.hasFile,
    monitored: row.episode.monitored,
    absoluteEpisodeNumber: row.episode.absoluteEpisodeNumber,
    sceneAbsoluteEpisodeNumber: null,
    sceneEpisodeNumber: null,
    sceneSeasonNumber: null,
    unverifiedSceneNumbering: false,
    endTime: endTime(row.episode.airDate, runtime),
    grabDate: null,
    series: options.includeSeries ? calendarSeriesResource(row) : null,
    images: [],
  }
}

function calendarSeriesResource(row: CalendarEpisode): CompatibleCalendarSeriesResource {
  return {
    id: row.series.id,
    title: row.series.title,
    sortTitle: sortTitle(row.series.title),
    status: row.series.status,
    overview: row.series.overview,
    network: row.series.network,
    airTime: null,
    images: [],
    remotePoster: row.series.posterPath,
    seasons: [],
    year: row.series.year,
    path: row.series.rootFolderPath,
    qualityProfileId: row.series.qualityProfileId,
    seasonFolder: row.series.seasonFolder,
    monitored: row.series.monitored,
    monitorNewItems: "all",
    useSceneNumbering: false,
    runtime: row.series.runtimeMinutes ?? 0,
    tvdbId: row.series.tvdbId,
    tvRageId: 0,
    tvMazeId: 0,
    tmdbId: row.series.tmdbId,
    firstAired: null,
    lastAired: null,
    seriesType: row.series.seriesType ?? "standard",
    cleanTitle: cleanTitle(row.series.title),
    imdbId: row.series.imdbId,
    titleSlug: titleSlug(row.series.title, row.series.tvdbId),
    rootFolderPath: row.series.rootFolderPath,
    folder: row.series.rootFolderPath,
    certification: row.series.certification,
    genres: row.series.genres,
    tags: [],
    added: row.series.addedAt.toISOString(),
    ratings: { votes: 0, value: 0 },
  }
}

function dateOnly(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null
}

function endTime(date: Date | null, runtimeMinutes: number): string | null {
  if (!date || runtimeMinutes <= 0) return null
  return new Date(date.getTime() + runtimeMinutes * 60_000).toISOString()
}

function sortTitle(title: string): string {
  return title.toLocaleLowerCase("en-US").replace(/^(the|a|an)\s+/, "")
}

function cleanTitle(title: string): string {
  return title.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "")
}

function titleSlug(title: string, id: number): string {
  const slug = title
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return slug.length > 0 ? slug : `series-${id}`
}
