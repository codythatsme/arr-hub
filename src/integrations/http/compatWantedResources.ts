import type { CalendarEpisode } from "#/effect/services/SeriesService"

import { calendarEpisodeResource } from "./compatCalendarResources"

export type CompatibleWantedEpisodeResource = ReturnType<typeof calendarEpisodeResource>

export interface CompatibleMovieResource {
  readonly id: number
  readonly title: string
  readonly originalTitle: string | null
  readonly alternateTitles: ReadonlyArray<unknown>
  readonly secondaryYear: number | null
  readonly secondaryYearSourceId: number
  readonly sortTitle: string
  readonly sizeOnDisk: number
  readonly status: string
  readonly overview: string | null
  readonly inCinemas: string | null
  readonly physicalRelease: string | null
  readonly digitalRelease: string | null
  readonly releaseDate: string | null
  readonly physicalReleaseNote: string | null
  readonly images: ReadonlyArray<unknown>
  readonly website: string | null
  readonly remotePoster: string | null
  readonly year: number | null
  readonly youTubeTrailerId: string | null
  readonly studio: string | null
  readonly path: string | null
  readonly qualityProfileId: number
  readonly hasFile: boolean
  readonly movieFileId: number
  readonly monitored: boolean
  readonly minimumAvailability: string
  readonly isAvailable: boolean
  readonly folderName: string | null
  readonly runtime: number
  readonly cleanTitle: string
  readonly imdbId: string | null
  readonly tmdbId: number
  readonly titleSlug: string
  readonly rootFolderPath: string | null
  readonly folder: string | null
  readonly certification: string | null
  readonly genres: ReadonlyArray<string>
  readonly keywords: ReadonlyArray<string>
  readonly tags: ReadonlyArray<number>
  readonly added: string
  readonly addOptions: null
  readonly ratings: {
    readonly votes: number
    readonly value: number
    readonly type: string
  }
  readonly movieFile: null
  readonly collection: null
  readonly popularity: number
  readonly lastSearchTime: string | null
  readonly statistics: null
}

export interface CompatiblePagingResource<T> {
  readonly page: number
  readonly pageSize: number
  readonly sortKey: string
  readonly sortDirection: "ascending" | "descending"
  readonly totalRecords: number
  readonly records: ReadonlyArray<T>
}

type MovieRow = {
  readonly id: number
  readonly tmdbId: number
  readonly imdbId: string | null
  readonly title: string
  readonly originalTitle: string | null
  readonly year: number | null
  readonly releaseDate: Date | null
  readonly overview: string | null
  readonly posterPath: string | null
  readonly genres: ReadonlyArray<string>
  readonly runtimeMinutes: number | null
  readonly qualityProfileId: number | null
  readonly rootFolderPath: string | null
  readonly monitored: boolean
  readonly hasFile: boolean
  readonly addedAt: Date
}

export function movieResource(movie: MovieRow): CompatibleMovieResource {
  const releaseDate = movie.releaseDate?.toISOString() ?? null

  return {
    id: movie.id,
    title: movie.title,
    originalTitle: movie.originalTitle,
    alternateTitles: [],
    secondaryYear: null,
    secondaryYearSourceId: 0,
    sortTitle: sortTitle(movie.title),
    sizeOnDisk: 0,
    status: "released",
    overview: movie.overview,
    inCinemas: releaseDate,
    physicalRelease: releaseDate,
    digitalRelease: releaseDate,
    releaseDate,
    physicalReleaseNote: null,
    images: imageResources(movie.posterPath),
    website: null,
    remotePoster: movie.posterPath,
    year: movie.year,
    youTubeTrailerId: null,
    studio: null,
    path: movie.rootFolderPath,
    qualityProfileId: movie.qualityProfileId ?? 0,
    hasFile: movie.hasFile,
    movieFileId: movie.hasFile ? movie.id : 0,
    monitored: movie.monitored,
    minimumAvailability: "released",
    isAvailable: isAvailable(movie.releaseDate),
    folderName: movie.rootFolderPath,
    runtime: movie.runtimeMinutes ?? 0,
    cleanTitle: cleanTitle(movie.title),
    imdbId: movie.imdbId,
    tmdbId: movie.tmdbId,
    titleSlug: titleSlug(movie.title, movie.tmdbId),
    rootFolderPath: movie.rootFolderPath,
    folder: movie.rootFolderPath,
    certification: null,
    genres: movie.genres,
    keywords: [],
    tags: [],
    added: movie.addedAt.toISOString(),
    addOptions: null,
    ratings: { votes: 0, value: 0, type: "user" },
    movieFile: null,
    collection: null,
    popularity: 0,
    lastSearchTime: null,
    statistics: null,
  }
}

export function wantedEpisodeResource(
  row: CalendarEpisode,
  options: { readonly includeSeries?: boolean } = {},
): CompatibleWantedEpisodeResource {
  return calendarEpisodeResource(row, options)
}

export function pagingResource<T>(input: {
  readonly records: ReadonlyArray<T>
  readonly totalRecords: number
  readonly page: number
  readonly pageSize: number
  readonly sortKey?: string
  readonly sortDirection?: "ascending" | "descending"
}): CompatiblePagingResource<T> {
  return {
    page: input.page,
    pageSize: input.pageSize,
    sortKey: input.sortKey ?? "sortTitle",
    sortDirection: input.sortDirection ?? "ascending",
    totalRecords: input.totalRecords,
    records: input.records,
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

function isAvailable(releaseDate: Date | null): boolean {
  return releaseDate === null || releaseDate.getTime() <= Date.now()
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
  return slug.length > 0 ? slug : `movie-${id}`
}
