import type { SeriesWithDetails, SeasonWithEpisodes } from "#/effect/services/SeriesService"

export interface CompatibleSeriesResource {
  readonly id: number
  readonly title: string
  readonly alternateTitles: ReadonlyArray<unknown>
  readonly sortTitle: string
  readonly status: string
  readonly ended: boolean
  readonly profileName: string | null
  readonly overview: string | null
  readonly nextAiring: string | null
  readonly previousAiring: string | null
  readonly network: string | null
  readonly airTime: string | null
  readonly images: ReadonlyArray<unknown>
  readonly remotePoster: string | null
  readonly seasons: ReadonlyArray<CompatibleSeasonResource>
  readonly year: number | null
  readonly path: string | null
  readonly qualityProfileId: number
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
  readonly added: string
  readonly addOptions: null
  readonly ratings: {
    readonly votes: number
    readonly value: number
  }
  readonly statistics: CompatibleSeriesStatisticsResource
  readonly episodesChanged: null
  readonly languageProfileId: number
}

export interface CompatibleSeasonResource {
  readonly seasonNumber: number
  readonly monitored: boolean
  readonly statistics: CompatibleSeasonStatisticsResource
  readonly images: ReadonlyArray<unknown>
}

export interface CompatibleSeriesStatisticsResource {
  readonly seasonCount: number
  readonly episodeFileCount: number
  readonly episodeCount: number
  readonly totalEpisodeCount: number
  readonly sizeOnDisk: number
  readonly releaseGroups: ReadonlyArray<string>
  readonly percentOfEpisodes: number
}

export interface CompatibleSeasonStatisticsResource {
  readonly nextAiring: string | null
  readonly previousAiring: string | null
  readonly episodeFileCount: number
  readonly episodeCount: number
  readonly totalEpisodeCount: number
  readonly sizeOnDisk: number
  readonly releaseGroups: ReadonlyArray<string>
  readonly percentOfEpisodes: number
}

export function seriesResource(details: SeriesWithDetails): CompatibleSeriesResource {
  const seasons = details.seasons
    .toSorted((left, right) => left.season.seasonNumber - right.season.seasonNumber)
    .map(seasonResource)
  const episodeDates = details.seasons
    .flatMap((season) => season.episodes)
    .map((episode) => episode.airDate)
    .filter((date): date is Date => date !== null)
  const nextAiring = nextDate(episodeDates)
  const previousAiring = previousDate(episodeDates)
  const firstAired = firstDate(episodeDates)
  const lastAired = previousAiring
  const episodeCount = details.seasons.reduce((sum, season) => sum + season.episodeCount, 0)
  const episodeFileCount = details.seasons.reduce((sum, season) => sum + season.availableCount, 0)
  const status = seriesStatus(details.series.status)

  return {
    id: details.series.id,
    title: details.series.title,
    alternateTitles: [],
    sortTitle: sortTitle(details.series.title),
    status,
    ended: status === "ended",
    profileName: null,
    overview: details.series.overview,
    nextAiring: nextAiring?.toISOString() ?? null,
    previousAiring: previousAiring?.toISOString() ?? null,
    network: details.series.network,
    airTime: null,
    images: imageResources(details.series.posterPath),
    remotePoster: details.series.posterPath,
    seasons,
    year: details.series.year,
    path: details.series.rootFolderPath,
    qualityProfileId: details.series.qualityProfileId ?? 0,
    seasonFolder: details.series.seasonFolder,
    monitored: details.series.monitored,
    monitorNewItems: "all",
    useSceneNumbering: false,
    runtime: details.series.runtimeMinutes ?? 0,
    tvdbId: details.series.tvdbId,
    tvRageId: 0,
    tvMazeId: 0,
    tmdbId: details.series.tmdbId,
    firstAired: firstAired?.toISOString() ?? null,
    lastAired: lastAired?.toISOString() ?? null,
    seriesType: details.series.seriesType ?? "standard",
    cleanTitle: cleanTitle(details.series.title),
    imdbId: details.series.imdbId,
    titleSlug: titleSlug(details.series.title, details.series.tvdbId),
    rootFolderPath: details.series.rootFolderPath,
    folder: details.series.rootFolderPath,
    certification: details.series.certification,
    genres: details.series.genres,
    tags: [],
    added: details.series.addedAt.toISOString(),
    addOptions: null,
    ratings: { votes: 0, value: 0 },
    statistics: {
      seasonCount: details.seasons.filter((season) => season.season.seasonNumber > 0).length,
      episodeFileCount,
      episodeCount,
      totalEpisodeCount: episodeCount,
      sizeOnDisk: 0,
      releaseGroups: [],
      percentOfEpisodes: percent(episodeFileCount, episodeCount),
    },
    episodesChanged: null,
    languageProfileId: 1,
  }
}

function seasonResource(season: SeasonWithEpisodes): CompatibleSeasonResource {
  const dates = season.episodes
    .map((episode) => episode.airDate)
    .filter((date): date is Date => date !== null)

  return {
    seasonNumber: season.season.seasonNumber,
    monitored: season.season.monitored,
    statistics: {
      nextAiring: nextDate(dates)?.toISOString() ?? null,
      previousAiring: previousDate(dates)?.toISOString() ?? null,
      episodeFileCount: season.availableCount,
      episodeCount: season.episodeCount,
      totalEpisodeCount: season.episodeCount,
      sizeOnDisk: 0,
      releaseGroups: [],
      percentOfEpisodes: percent(season.availableCount, season.episodeCount),
    },
    images: [],
  }
}

function imageResources(posterPath: string | null): ReadonlyArray<unknown> {
  if (!posterPath) return []
  return [
    {
      coverType: "poster",
      url: posterPath,
      remoteUrl: posterPath,
    },
  ]
}

function seriesStatus(status: string): string {
  return status === "ended" ? "ended" : "continuing"
}

function nextDate(dates: ReadonlyArray<Date>): Date | null {
  const now = Date.now()
  return (
    dates
      .filter((date) => date.getTime() > now)
      .toSorted((left, right) => left.getTime() - right.getTime())[0] ?? null
  )
}

function previousDate(dates: ReadonlyArray<Date>): Date | null {
  const now = Date.now()
  return (
    dates
      .filter((date) => date.getTime() <= now)
      .toSorted((left, right) => right.getTime() - left.getTime())[0] ?? null
  )
}

function firstDate(dates: ReadonlyArray<Date>): Date | null {
  return dates.toSorted((left, right) => left.getTime() - right.getTime())[0] ?? null
}

function percent(available: number, total: number): number {
  return total === 0 ? 0 : (available / total) * 100
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
