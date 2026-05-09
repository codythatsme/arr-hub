import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { MediaImportService } from "#/effect/services/MediaImportService"

import { authedProcedure, runEffect } from "../init"

const remotePathMappingSchema = z.object({
  downloadClientId: z.number().nullish(),
  remotePath: z.string(),
  localPath: z.string(),
})

const manualMovieImportSchema = z.object({
  movieId: z.number(),
  sourcePath: z.string(),
  releaseTitle: z.string().nullish(),
})

const manualEpisodeImportSchema = z.object({
  seriesId: z.number(),
  episodeIds: z.array(z.number()).min(1),
  sourcePath: z.string(),
  releaseTitle: z.string().nullish(),
})

export const mediaManagementRouter = {
  listRemotePathMappings: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const mediaImport = yield* MediaImportService
        return yield* mediaImport.listRemotePathMappings()
      }),
    ),
  ),

  addRemotePathMapping: authedProcedure.input(remotePathMappingSchema).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const mediaImport = yield* MediaImportService
        return yield* mediaImport.addRemotePathMapping(input)
      }),
    ),
  ),

  updateRemotePathMapping: authedProcedure
    .input(z.object({ id: z.number(), data: remotePathMappingSchema }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const mediaImport = yield* MediaImportService
          return yield* mediaImport.updateRemotePathMapping(input.id, input.data)
        }),
      ),
    ),

  removeRemotePathMapping: authedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const mediaImport = yield* MediaImportService
          yield* mediaImport.removeRemotePathMapping(input.id)
        }),
      ),
    ),

  manualImportMovie: authedProcedure.input(manualMovieImportSchema).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const mediaImport = yield* MediaImportService
        return yield* mediaImport.manualImportMovie(input)
      }),
    ),
  ),

  manualImportEpisodes: authedProcedure.input(manualEpisodeImportSchema).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const mediaImport = yield* MediaImportService
        return yield* mediaImport.manualImportEpisodes(input)
      }),
    ),
  ),

  scanLibraries: authedProcedure.mutation(() =>
    runEffect(
      Effect.gen(function* () {
        const mediaImport = yield* MediaImportService
        return yield* mediaImport.scanLibraries()
      }),
    ),
  ),

  previewMovieRename: authedProcedure.input(z.object({ movieId: z.number() })).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const mediaImport = yield* MediaImportService
        return yield* mediaImport.previewMovieRename(input.movieId)
      }),
    ),
  ),

  renameMovie: authedProcedure.input(z.object({ movieId: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const mediaImport = yield* MediaImportService
        return yield* mediaImport.renameMovie(input.movieId)
      }),
    ),
  ),

  previewSeriesRename: authedProcedure
    .input(z.object({ seriesId: z.number() }))
    .query(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const mediaImport = yield* MediaImportService
          return yield* mediaImport.previewSeriesRename(input.seriesId)
        }),
      ),
    ),

  renameSeries: authedProcedure.input(z.object({ seriesId: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const mediaImport = yield* MediaImportService
        return yield* mediaImport.renameSeries(input.seriesId)
      }),
    ),
  ),
} satisfies TRPCRouterRecord
