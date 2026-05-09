import { z } from "zod"

export const SystemStatusSchema = z.object({
  version: z.string(),
})

export type SystemStatus = z.infer<typeof SystemStatusSchema>

const ImageSchema = z.object({
  coverType: z.string(),
  remoteUrl: z.string().optional(),
  url: z.string().optional(),
})

const RootFolderSchema = z.object({
  id: z.number(),
  path: z.string(),
  accessible: z.boolean().optional(),
  freeSpace: z.number().optional(),
})

export const RootFolderListSchema = z.array(RootFolderSchema)

export const RadarrMovieSchema = z.object({
  id: z.number(),
  tmdbId: z.number(),
  title: z.string(),
  year: z.number().optional(),
  overview: z.string().optional(),
  monitored: z.boolean(),
  hasFile: z.boolean(),
  path: z.string().optional(),
  images: z.array(ImageSchema).optional(),
})

export type RadarrMovie = z.infer<typeof RadarrMovieSchema>

export const RadarrMovieListSchema = z.array(RadarrMovieSchema)

const SonarrSeasonStatisticsSchema = z.object({
  totalEpisodeCount: z.number().optional(),
  episodeFileCount: z.number().optional(),
})

const SonarrSeasonSchema = z.object({
  seasonNumber: z.number(),
  monitored: z.boolean(),
  statistics: SonarrSeasonStatisticsSchema.optional(),
})

export const SonarrSeriesSchema = z.object({
  id: z.number(),
  tvdbId: z.number(),
  title: z.string(),
  year: z.number().optional(),
  overview: z.string().optional(),
  monitored: z.boolean(),
  status: z.string(),
  network: z.string().optional(),
  path: z.string().optional(),
  seasonFolder: z.boolean().optional(),
  seasons: z.array(SonarrSeasonSchema),
  images: z.array(ImageSchema).optional(),
})

export type SonarrSeries = z.infer<typeof SonarrSeriesSchema>

export const SonarrSeriesListSchema = z.array(SonarrSeriesSchema)

export const SonarrEpisodeSchema = z
  .object({
    id: z.number(),
    seriesId: z.number(),
    tvdbId: z.number().nullish(),
    seasonNumber: z.number(),
    episodeNumber: z.number(),
    absoluteEpisodeNumber: z.number().nullish(),
    title: z.string().optional(),
    airDate: z.string().nullish(),
    airDateUtc: z.string().nullish(),
    overview: z.string().nullish(),
    monitored: z.boolean(),
    hasFile: z.boolean().optional(),
    episodeFileId: z.number().nullish(),
  })
  .passthrough()

export type SonarrEpisode = z.infer<typeof SonarrEpisodeSchema>

export const SonarrEpisodeListSchema = z.array(SonarrEpisodeSchema)

const SonarrQualitySchema = z
  .object({
    quality: z
      .object({
        name: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

export const SonarrEpisodeFileSchema = z
  .object({
    id: z.number(),
    seriesId: z.number(),
    seasonNumber: z.number(),
    relativePath: z.string().optional(),
    path: z.string().optional(),
    quality: SonarrQualitySchema.optional(),
  })
  .passthrough()

export type SonarrEpisodeFile = z.infer<typeof SonarrEpisodeFileSchema>

export const SonarrEpisodeFileListSchema = z.array(SonarrEpisodeFileSchema)

export function posterOf(
  images: ReadonlyArray<{ coverType: string; remoteUrl?: string; url?: string }> | undefined,
): string | null {
  if (!images) return null
  const poster = images.find((i) => i.coverType === "poster")
  return poster?.remoteUrl ?? poster?.url ?? null
}
