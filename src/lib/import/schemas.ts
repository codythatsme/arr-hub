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

export function posterOf(
  images: ReadonlyArray<{ coverType: string; remoteUrl?: string; url?: string }> | undefined,
): string | null {
  if (!images) return null
  const poster = images.find((i) => i.coverType === "poster")
  return poster?.remoteUrl ?? poster?.url ?? null
}
