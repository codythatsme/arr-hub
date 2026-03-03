import { SqlError } from "@effect/sql/SqlError"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { downloadQueue } from "#/db/schema"
import type { RankedDecision } from "#/effect/domain/release"
import {
  AcquisitionError,
  type DownloadClientError,
  type EncryptionError,
  type IndexerError,
  type NotFoundError,
  type ParseFailed,
  ValidationError,
} from "#/effect/errors"

import { Db } from "./Db"
import { DownloadClientService } from "./DownloadClientService"
import { IndexerService } from "./IndexerService"
import { MovieService } from "./MovieService"
import { ReleasePolicyEngine } from "./ReleasePolicyEngine"

// ── Result types ──

export interface GrabResult {
  readonly hash: string
  readonly candidateTitle: string
}

type PipelineError =
  | AcquisitionError
  | NotFoundError
  | ValidationError
  | IndexerError
  | DownloadClientError
  | EncryptionError
  | ParseFailed
  | SqlError

// ── Service tag ──

export class AcquisitionPipeline extends Context.Tag("@arr-hub/AcquisitionPipeline")<
  AcquisitionPipeline,
  {
    /** Search + evaluate + grab best release for a movie. */
    readonly searchAndGrab: (movieId: number) => Effect.Effect<GrabResult | null, PipelineError>
    /** Search + evaluate only (interactive UI). */
    readonly searchAndEvaluate: (
      movieId: number,
    ) => Effect.Effect<ReadonlyArray<RankedDecision>, PipelineError>
    /** Grab a specific release URL (manual grab from UI). */
    readonly grab: (
      movieId: number,
      downloadUrl: string,
      candidateTitle: string,
    ) => Effect.Effect<GrabResult, PipelineError>
  }
>() {}

// ── Live implementation ──

export const AcquisitionPipelineLive = Layer.effect(
  AcquisitionPipeline,
  Effect.gen(function* () {
    const db = yield* Db
    const movieService = yield* MovieService
    const indexerService = yield* IndexerService
    const policyEngine = yield* ReleasePolicyEngine
    const downloadClientService = yield* DownloadClientService

    /** Find first enabled download client. */
    const pickClient = Effect.gen(function* () {
      const clients = yield* downloadClientService.list()
      const enabled = clients.filter((c) => c.enabled)
      if (enabled.length === 0) {
        return yield* new ValidationError({ message: "no enabled download client" })
      }
      return enabled[0]
    })

    /** Load movie and guard monitored + has quality profile. Returns movie with guaranteed profileId. */
    const loadMovie = (movieId: number) =>
      Effect.gen(function* () {
        const movie = yield* movieService.getById(movieId)

        if (!movie.monitored) {
          return yield* new AcquisitionError({
            movieId,
            stage: "search",
            message: "movie not monitored",
          })
        }

        if (movie.qualityProfileId === null) {
          return yield* new AcquisitionError({
            movieId,
            stage: "search",
            message: "no quality profile assigned",
          })
        }

        return { ...movie, qualityProfileId: movie.qualityProfileId }
      })

    /** Link queue row to movie after grab. */
    const linkQueueToMovie = (hash: string, movieId: number) =>
      db
        .update(downloadQueue)
        .set({ movieId })
        .where(eq(downloadQueue.externalId, hash))

    return {
      searchAndGrab: (movieId) =>
        Effect.gen(function* () {
          const movie = yield* loadMovie(movieId)
          const client = yield* pickClient

          // Search
          const { releases } = yield* indexerService.search({
            type: "movie",
            term: movie.title,
            tmdbId: movie.tmdbId,
          })

          if (releases.length === 0) return null

          // Build evaluation context
          const existingFile = movie.hasFile && movie.existingQualityName !== null && movie.existingQualityRank !== null
            ? {
                qualityName: movie.existingQualityName as import("#/effect/domain/quality").QualityName,
                qualityRank: movie.existingQualityRank,
                formatScore: movie.existingFormatScore ?? 0,
              }
            : undefined

          // Evaluate
          const decisions = yield* policyEngine.evaluate(
            releases,
            movie.qualityProfileId,
            { mediaId: movie.id, mediaType: "movie", existingFile },
          )

          // Record decisions
          yield* policyEngine.recordDecisions(decisions, {
            mediaId: movie.id,
            mediaType: "movie",
          })

          // Find first accepted/upgrade
          const best = decisions.find(
            (d) => d.decision === "accepted" || d.decision === "upgrade",
          )
          if (!best) return null

          // Grab
          const hash = yield* downloadClientService.addDownload(
            client.id,
            best.candidate.downloadUrl,
          )

          // Link queue → movie
          yield* linkQueueToMovie(hash, movie.id)

          return { hash, candidateTitle: best.candidate.title }
        }),

      searchAndEvaluate: (movieId) =>
        Effect.gen(function* () {
          const movie = yield* loadMovie(movieId)

          const { releases } = yield* indexerService.search({
            type: "movie",
            term: movie.title,
            tmdbId: movie.tmdbId,
          })

          const existingFile = movie.hasFile && movie.existingQualityName !== null && movie.existingQualityRank !== null
            ? {
                qualityName: movie.existingQualityName as import("#/effect/domain/quality").QualityName,
                qualityRank: movie.existingQualityRank,
                formatScore: movie.existingFormatScore ?? 0,
              }
            : undefined

          const decisions = yield* policyEngine.evaluate(
            releases,
            movie.qualityProfileId,
            { mediaId: movie.id, mediaType: "movie", existingFile },
          )

          yield* policyEngine.recordDecisions(decisions, {
            mediaId: movie.id,
            mediaType: "movie",
          })

          return decisions
        }),

      grab: (movieId, downloadUrl, candidateTitle) =>
        Effect.gen(function* () {
          const movie = yield* loadMovie(movieId)
          const client = yield* pickClient

          const hash = yield* downloadClientService.addDownload(
            client.id,
            downloadUrl,
          )

          yield* linkQueueToMovie(hash, movie.id)

          return { hash, candidateTitle }
        }),
    }
  }),
)
