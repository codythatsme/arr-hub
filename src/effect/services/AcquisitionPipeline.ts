import { SqlError } from "@effect/sql/SqlError"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { downloadQueue, episodes as episodesTable, seasons as seasonsTable } from "#/db/schema"
import type { IndexerProtocol, ReleaseCandidate } from "#/effect/domain/indexer"
import { parseQualityName } from "#/effect/domain/quality"
import {
  type EvaluationContext,
  type ExistingFile,
  type ParsedTitle,
  type RankedDecision,
  isSeasonPack,
} from "#/effect/domain/release"
import {
  AcquisitionError,
  type DownloadClientError,
  type EncryptionError,
  type IndexerError,
  NotFoundError,
  type ParseFailed,
  ValidationError,
} from "#/effect/errors"

import { AdapterRegistry } from "./AdapterRegistry"
import { Db } from "./Db"
import { DownloadClientService } from "./DownloadClientService"
import { IndexerService } from "./IndexerService"
import { MovieService } from "./MovieService"
import { recordDomainHistory } from "./OperationalHistoryService"
import { ReleasePolicyEngine } from "./ReleasePolicyEngine"
import { SeriesService } from "./SeriesService"

// ── Result types ──

export interface GrabResult {
  readonly hash: string
  readonly candidateTitle: string
}

/** Episodes in a season that still need a file (monitored + no hasFile). */
const wantedEpisodes = (eps: ReadonlyArray<typeof episodesTable.$inferSelect>) =>
  eps.filter((e) => e.monitored && !e.hasFile)

const isAcceptedDecision = (decision: RankedDecision) =>
  decision.decision === "accepted" || decision.decision === "upgrade"

const decisionHistoryMetadata = (decision: RankedDecision) => ({
  size: decision.candidate.size,
  protocol: decision.candidate.protocol,
  downloadUrl: decision.candidate.downloadUrl,
  infoUrl: decision.candidate.infoUrl,
  qualityRank: decision.qualityRank,
  formatScore: decision.formatScore,
  decision: decision.decision,
})

/** Build indexer search term from a series title. Identity for now — override later if needed. */
const searchTermForSeries = (title: string) => title

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
    /** Evaluate already-fetched RSS/recent releases and grab the best movie match. */
    readonly grabBestRecentMovieRelease: (
      movieId: number,
      releases: ReadonlyArray<ReleaseCandidate>,
    ) => Effect.Effect<GrabResult | null, PipelineError>

    // ── TV ──

    /** Search + evaluate + grab best release for a single episode. */
    readonly searchAndGrabEpisode: (
      episodeId: number,
    ) => Effect.Effect<GrabResult | null, PipelineError>
    /** Search + evaluate only for an episode (interactive UI). */
    readonly searchAndEvaluateEpisode: (
      episodeId: number,
    ) => Effect.Effect<ReadonlyArray<RankedDecision>, PipelineError>
    /** Grab a specific release URL for an episode. */
    readonly grabEpisode: (
      episodeId: number,
      downloadUrl: string,
      candidateTitle: string,
    ) => Effect.Effect<GrabResult, PipelineError>
    /** Evaluate already-fetched RSS/recent releases and grab the best episode match. */
    readonly grabBestRecentEpisodeRelease: (
      episodeId: number,
      releases: ReadonlyArray<ReleaseCandidate>,
    ) => Effect.Effect<GrabResult | null, PipelineError>
    /** Search a season — pack-first, falls back to per-episode if no pack accepted. */
    readonly searchAndGrabSeason: (
      seasonId: number,
    ) => Effect.Effect<ReadonlyArray<GrabResult>, PipelineError>
    /** Iterate all seasons with wanted episodes. */
    readonly searchAndGrabSeries: (
      seriesId: number,
    ) => Effect.Effect<ReadonlyArray<GrabResult>, PipelineError>
  }
>() {}

// ── Live implementation ──

export const AcquisitionPipelineLive = Layer.effect(
  AcquisitionPipeline,
  Effect.gen(function* () {
    const db = yield* Db
    const movieService = yield* MovieService
    const seriesService = yield* SeriesService
    const indexerService = yield* IndexerService
    const policyEngine = yield* ReleasePolicyEngine
    const downloadClientService = yield* DownloadClientService
    const adapterRegistry = yield* AdapterRegistry

    /**
     * Pick best enabled download client for the given protocol.
     * Prefers clients whose adapter has matching protocolAffinity, falls back to any enabled.
     */
    const pickClient = (protocol?: IndexerProtocol) =>
      Effect.gen(function* () {
        const clients = yield* downloadClientService.list()
        const enabled = clients.filter((c) => c.enabled)
        if (enabled.length === 0) {
          return yield* new ValidationError({ message: "no enabled download client" })
        }

        if (protocol) {
          const registeredTypes = adapterRegistry.listDownloadClientTypes()
          const affinityMap = new Map(
            registeredTypes.map((r) => [r.type, r.metadata.protocolAffinity]),
          )

          const matching = enabled.filter((c) => {
            const affinity = affinityMap.get(c.type)
            return affinity === protocol || affinity === "any"
          })

          if (matching.length > 0) return matching[0]
        }

        // Fallback: return first enabled client regardless of protocol
        return enabled[0]
      })

    /** Load movie and guard monitored + has quality profile. Returns movie with guaranteed profileId. */
    const loadMovie = (movieId: number) =>
      Effect.gen(function* () {
        const movie = yield* movieService.getById(movieId)

        if (!movie.monitored) {
          return yield* new AcquisitionError({
            mediaKind: "movie",
            mediaId: movieId,
            stage: "search",
            message: "movie not monitored",
          })
        }

        if (movie.qualityProfileId === null) {
          return yield* new AcquisitionError({
            mediaKind: "movie",
            mediaId: movieId,
            stage: "search",
            message: "no quality profile assigned",
          })
        }

        return { ...movie, qualityProfileId: movie.qualityProfileId }
      })

    /** Link queue row to movie after grab. */
    const linkQueueToMovie = (hash: string, movieId: number) =>
      db.update(downloadQueue).set({ movieId }).where(eq(downloadQueue.externalId, hash))

    /** Link queue row to series + episodes (individual or season pack). */
    const linkQueueToTv = (hash: string, seriesId: number, episodeIds: ReadonlyArray<number>) =>
      db
        .update(downloadQueue)
        .set({ seriesId, episodeIds })
        .where(eq(downloadQueue.externalId, hash))

    /** Parse existing file columns into domain ExistingFile, validating quality at boundary. */
    const existingFileFromRow = (row: {
      hasFile: boolean
      existingQualityName: string | null
      existingQualityRank: number | null
      existingFormatScore: number | null
    }): ExistingFile | undefined => {
      if (!row.hasFile || row.existingQualityName === null || row.existingQualityRank === null)
        return undefined
      const qualityName = parseQualityName(row.existingQualityName)
      if (!qualityName) return undefined
      return {
        qualityName,
        qualityRank: row.existingQualityRank,
        formatScore: row.existingFormatScore ?? 0,
      }
    }

    /** Load episode + its season + series, guarded for monitored + profile. */
    const loadEpisodeContext = (episodeId: number) =>
      Effect.gen(function* () {
        const epRows = yield* db.select().from(episodesTable).where(eq(episodesTable.id, episodeId))
        const episode = epRows[0]
        if (!episode) return yield* new NotFoundError({ entity: "episode", id: episodeId })

        const seasonRows = yield* db
          .select()
          .from(seasonsTable)
          .where(eq(seasonsTable.id, episode.seasonId))
        const season = seasonRows[0]
        if (!season) return yield* new NotFoundError({ entity: "season", id: episode.seasonId })

        const seriesDetails = yield* seriesService.getById(season.seriesId)
        const s = seriesDetails.series

        if (!s.monitored) {
          return yield* new AcquisitionError({
            mediaKind: "episode",
            mediaId: episodeId,
            stage: "search",
            message: "series not monitored",
          })
        }
        if (!season.monitored) {
          return yield* new AcquisitionError({
            mediaKind: "episode",
            mediaId: episodeId,
            stage: "search",
            message: "season not monitored",
          })
        }
        if (!episode.monitored) {
          return yield* new AcquisitionError({
            mediaKind: "episode",
            mediaId: episodeId,
            stage: "search",
            message: "episode not monitored",
          })
        }
        if (s.qualityProfileId === null) {
          return yield* new AcquisitionError({
            mediaKind: "episode",
            mediaId: episodeId,
            stage: "search",
            message: "no quality profile assigned",
          })
        }

        return {
          episode,
          season,
          series: s,
          qualityProfileId: s.qualityProfileId,
        }
      })

    /** Load season + series + all episodes for that season; guard monitored + profile. */
    const loadSeasonContext = (seasonId: number) =>
      Effect.gen(function* () {
        const seasonRows = yield* db
          .select()
          .from(seasonsTable)
          .where(eq(seasonsTable.id, seasonId))
        const season = seasonRows[0]
        if (!season) return yield* new NotFoundError({ entity: "season", id: seasonId })

        const seriesDetails = yield* seriesService.getById(season.seriesId)
        const s = seriesDetails.series

        if (!s.monitored) {
          return yield* new AcquisitionError({
            mediaKind: "season",
            mediaId: seasonId,
            stage: "search",
            message: "series not monitored",
          })
        }
        if (!season.monitored) {
          return yield* new AcquisitionError({
            mediaKind: "season",
            mediaId: seasonId,
            stage: "search",
            message: "season not monitored",
          })
        }
        if (s.qualityProfileId === null) {
          return yield* new AcquisitionError({
            mediaKind: "season",
            mediaId: seasonId,
            stage: "search",
            message: "no quality profile assigned",
          })
        }

        const eps = yield* db
          .select()
          .from(episodesTable)
          .where(eq(episodesTable.seasonId, seasonId))

        return {
          season,
          series: s,
          qualityProfileId: s.qualityProfileId,
          episodes: eps,
        }
      })

    /**
     * Composable step: given a best decision for a season search, map its parsed title to
     * the concrete set of episodes the pack covers (all wanted eps in the season).
     * For non-pack candidates, returns just the single episode matching parsed.episode.
     */
    const mapCandidateToEpisodes = (
      parsed: ParsedTitle | null,
      seasonEps: ReadonlyArray<typeof episodesTable.$inferSelect>,
    ): ReadonlyArray<number> => {
      if (parsed && isSeasonPack(parsed)) {
        return wantedEpisodes(seasonEps).map((e) => e.id)
      }
      if (parsed && parsed.episode !== null) {
        const match = seasonEps.find((e) => e.episodeNumber === parsed.episode)
        return match ? [match.id] : []
      }
      return []
    }

    const firstGrabbableDecision = (
      decisions: ReadonlyArray<RankedDecision>,
      predicate: (decision: RankedDecision) => boolean = () => true,
    ) =>
      Effect.gen(function* () {
        for (const decision of decisions) {
          if (!isAcceptedDecision(decision) || !predicate(decision)) continue
          const canGrab = yield* indexerService.canGrab(decision.candidate.indexerId)
          if (canGrab) return decision
        }
        return null
      })

    const grabBestMovieFromReleases = (
      movieId: number,
      releases: ReadonlyArray<ReleaseCandidate>,
    ): Effect.Effect<GrabResult | null, PipelineError> =>
      Effect.gen(function* () {
        const movie = yield* loadMovie(movieId)
        if (releases.length === 0) return null

        const evalCtx: EvaluationContext = {
          mediaId: movie.id,
          mediaType: "movie",
          existingFile: existingFileFromRow(movie),
        }
        const decisions = yield* policyEngine.evaluate(releases, movie.qualityProfileId, evalCtx)
        yield* policyEngine.recordDecisions(decisions, evalCtx)

        const best = yield* firstGrabbableDecision(decisions)
        if (!best) return null

        const client = yield* pickClient(best.candidate.protocol)
        const hash = yield* downloadClientService.addDownload(client.id, best.candidate.downloadUrl)
        yield* indexerService.recordGrab(best.candidate.indexerId)
        yield* linkQueueToMovie(hash, movie.id)
        yield* recordDomainHistory(db, {
          eventType: "grabbed",
          mediaKind: "movie",
          movieId: movie.id,
          releaseTitle: best.candidate.title,
          indexerId: best.candidate.indexerId,
          indexerName: best.candidate.indexerName,
          downloadClientId: client.id,
          downloadClientName: client.name,
          downloadExternalId: hash,
          title: `Grabbed ${movie.title}`,
          message: `Grabbed ${best.candidate.title} from ${best.candidate.indexerName}`,
          metadata: decisionHistoryMetadata(best),
        })

        return { hash, candidateTitle: best.candidate.title }
      })

    const grabBestEpisodeFromReleases = (
      episodeId: number,
      releases: ReadonlyArray<ReleaseCandidate>,
    ): Effect.Effect<GrabResult | null, PipelineError> =>
      Effect.gen(function* () {
        const ctx = yield* loadEpisodeContext(episodeId)
        if (releases.length === 0) return null

        const evalCtx: EvaluationContext = {
          mediaId: ctx.episode.id,
          mediaType: "episode",
          existingFile: existingFileFromRow(ctx.episode),
        }
        const decisions = yield* policyEngine.evaluate(releases, ctx.qualityProfileId, evalCtx)
        yield* policyEngine.recordDecisions(decisions, evalCtx)

        const best = yield* firstGrabbableDecision(decisions)
        if (!best) return null

        const client = yield* pickClient(best.candidate.protocol)
        const hash = yield* downloadClientService.addDownload(client.id, best.candidate.downloadUrl)
        yield* indexerService.recordGrab(best.candidate.indexerId)
        yield* linkQueueToTv(hash, ctx.series.id, [ctx.episode.id])
        yield* recordDomainHistory(db, {
          eventType: "grabbed",
          mediaKind: "episode",
          seriesId: ctx.series.id,
          seasonId: ctx.season.id,
          episodeId: ctx.episode.id,
          releaseTitle: best.candidate.title,
          indexerId: best.candidate.indexerId,
          indexerName: best.candidate.indexerName,
          downloadClientId: client.id,
          downloadClientName: client.name,
          downloadExternalId: hash,
          title: `Grabbed ${ctx.series.title} S${String(ctx.season.seasonNumber).padStart(2, "0")}E${String(ctx.episode.episodeNumber).padStart(2, "0")}`,
          message: `Grabbed ${best.candidate.title} from ${best.candidate.indexerName}`,
          metadata: decisionHistoryMetadata(best),
        })

        return { hash, candidateTitle: best.candidate.title }
      })

    const grabSeason = (
      seasonId: number,
    ): Effect.Effect<ReadonlyArray<GrabResult>, PipelineError> =>
      Effect.gen(function* () {
        const ctx = yield* loadSeasonContext(seasonId)
        const wanted = wantedEpisodes(ctx.episodes)
        if (wanted.length === 0) return []

        const { releases: packReleases } = yield* indexerService.search({
          type: "tv",
          term: searchTermForSeries(ctx.series.title),
          tvdbId: ctx.series.tvdbId,
          season: ctx.season.seasonNumber,
        })

        if (packReleases.length > 0) {
          const packEvalCtx: EvaluationContext = {
            mediaId: ctx.season.id,
            mediaType: "season",
          }

          const packDecisions = yield* policyEngine.evaluate(
            packReleases,
            ctx.qualityProfileId,
            packEvalCtx,
          )
          yield* policyEngine.recordDecisions(packDecisions, packEvalCtx)

          const packBest = yield* firstGrabbableDecision(
            packDecisions,
            (d) =>
              d.parsed !== null &&
              isSeasonPack(d.parsed) &&
              d.parsed.season === ctx.season.seasonNumber,
          )

          if (packBest) {
            const client = yield* pickClient(packBest.candidate.protocol)
            const hash = yield* downloadClientService.addDownload(
              client.id,
              packBest.candidate.downloadUrl,
            )
            yield* indexerService.recordGrab(packBest.candidate.indexerId)

            const coveredEpisodeIds = mapCandidateToEpisodes(packBest.parsed, ctx.episodes)
            yield* linkQueueToTv(hash, ctx.series.id, coveredEpisodeIds)
            yield* recordDomainHistory(db, {
              eventType: "grabbed",
              mediaKind: "season",
              seriesId: ctx.series.id,
              seasonId: ctx.season.id,
              releaseTitle: packBest.candidate.title,
              indexerId: packBest.candidate.indexerId,
              indexerName: packBest.candidate.indexerName,
              downloadClientId: client.id,
              downloadClientName: client.name,
              downloadExternalId: hash,
              title: `Grabbed ${ctx.series.title} season ${ctx.season.seasonNumber}`,
              message: `Grabbed ${packBest.candidate.title} from ${packBest.candidate.indexerName}`,
              metadata: {
                ...decisionHistoryMetadata(packBest),
                episodeIds: coveredEpisodeIds,
              },
            })

            return [{ hash, candidateTitle: packBest.candidate.title }]
          }
        }

        const results: Array<GrabResult> = []
        for (const ep of wanted) {
          const { releases } = yield* indexerService.search({
            type: "tv",
            term: searchTermForSeries(ctx.series.title),
            tvdbId: ctx.series.tvdbId,
            season: ctx.season.seasonNumber,
            episode: ep.episodeNumber,
          })

          if (releases.length === 0) continue

          const evalCtx: EvaluationContext = {
            mediaId: ep.id,
            mediaType: "episode",
            existingFile: existingFileFromRow(ep),
          }

          const decisions = yield* policyEngine.evaluate(releases, ctx.qualityProfileId, evalCtx)
          yield* policyEngine.recordDecisions(decisions, evalCtx)

          const best = yield* firstGrabbableDecision(decisions)
          if (!best) continue

          const client = yield* pickClient(best.candidate.protocol)
          const hash = yield* downloadClientService.addDownload(
            client.id,
            best.candidate.downloadUrl,
          )
          yield* indexerService.recordGrab(best.candidate.indexerId)
          yield* linkQueueToTv(hash, ctx.series.id, [ep.id])
          yield* recordDomainHistory(db, {
            eventType: "grabbed",
            mediaKind: "episode",
            seriesId: ctx.series.id,
            seasonId: ctx.season.id,
            episodeId: ep.id,
            releaseTitle: best.candidate.title,
            indexerId: best.candidate.indexerId,
            indexerName: best.candidate.indexerName,
            downloadClientId: client.id,
            downloadClientName: client.name,
            downloadExternalId: hash,
            title: `Grabbed ${ctx.series.title} S${String(ctx.season.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`,
            message: `Grabbed ${best.candidate.title} from ${best.candidate.indexerName}`,
            metadata: decisionHistoryMetadata(best),
          })

          results.push({ hash, candidateTitle: best.candidate.title })
        }

        return results
      })

    return {
      // ── Movies ──

      searchAndGrab: (movieId) =>
        Effect.gen(function* () {
          const movie = yield* loadMovie(movieId)

          const { releases } = yield* indexerService.search({
            type: "movie",
            term: movie.title,
            tmdbId: movie.tmdbId,
          })

          return yield* grabBestMovieFromReleases(movie.id, releases)
        }),

      searchAndEvaluate: (movieId) =>
        Effect.gen(function* () {
          const movie = yield* loadMovie(movieId)

          const { releases } = yield* indexerService.search({
            type: "movie",
            term: movie.title,
            tmdbId: movie.tmdbId,
          })

          const decisions = yield* policyEngine.evaluate(releases, movie.qualityProfileId, {
            mediaId: movie.id,
            mediaType: "movie",
            existingFile: existingFileFromRow(movie),
          })

          yield* policyEngine.recordDecisions(decisions, {
            mediaId: movie.id,
            mediaType: "movie",
          })

          return decisions
        }),

      grab: (movieId, downloadUrl, candidateTitle) =>
        Effect.gen(function* () {
          const movie = yield* loadMovie(movieId)
          // No protocol hint for manual grabs — use first enabled client
          const client = yield* pickClient()

          const hash = yield* downloadClientService.addDownload(client.id, downloadUrl)

          yield* linkQueueToMovie(hash, movie.id)
          yield* recordDomainHistory(db, {
            eventType: "grabbed",
            mediaKind: "movie",
            movieId: movie.id,
            releaseTitle: candidateTitle,
            downloadClientId: client.id,
            downloadClientName: client.name,
            downloadExternalId: hash,
            title: `Grabbed ${movie.title}`,
            message: `Manually grabbed ${candidateTitle}`,
            metadata: { downloadUrl },
          })

          return { hash, candidateTitle }
        }),

      grabBestRecentMovieRelease: grabBestMovieFromReleases,

      // ── TV: single episode ──

      searchAndGrabEpisode: (episodeId) =>
        Effect.gen(function* () {
          const ctx = yield* loadEpisodeContext(episodeId)

          const { releases } = yield* indexerService.search({
            type: "tv",
            term: searchTermForSeries(ctx.series.title),
            tvdbId: ctx.series.tvdbId,
            season: ctx.season.seasonNumber,
            episode: ctx.episode.episodeNumber,
          })

          return yield* grabBestEpisodeFromReleases(ctx.episode.id, releases)
        }),

      searchAndEvaluateEpisode: (episodeId) =>
        Effect.gen(function* () {
          const ctx = yield* loadEpisodeContext(episodeId)

          const { releases } = yield* indexerService.search({
            type: "tv",
            term: searchTermForSeries(ctx.series.title),
            tvdbId: ctx.series.tvdbId,
            season: ctx.season.seasonNumber,
            episode: ctx.episode.episodeNumber,
          })

          const evalCtx: EvaluationContext = {
            mediaId: ctx.episode.id,
            mediaType: "episode",
            existingFile: existingFileFromRow(ctx.episode),
          }

          const decisions = yield* policyEngine.evaluate(releases, ctx.qualityProfileId, evalCtx)
          yield* policyEngine.recordDecisions(decisions, evalCtx)
          return decisions
        }),

      grabEpisode: (episodeId, downloadUrl, candidateTitle) =>
        Effect.gen(function* () {
          const ctx = yield* loadEpisodeContext(episodeId)
          const client = yield* pickClient()
          const hash = yield* downloadClientService.addDownload(client.id, downloadUrl)
          yield* linkQueueToTv(hash, ctx.series.id, [ctx.episode.id])
          yield* recordDomainHistory(db, {
            eventType: "grabbed",
            mediaKind: "episode",
            seriesId: ctx.series.id,
            seasonId: ctx.season.id,
            episodeId: ctx.episode.id,
            releaseTitle: candidateTitle,
            downloadClientId: client.id,
            downloadClientName: client.name,
            downloadExternalId: hash,
            title: `Grabbed ${ctx.series.title} S${String(ctx.season.seasonNumber).padStart(2, "0")}E${String(ctx.episode.episodeNumber).padStart(2, "0")}`,
            message: `Manually grabbed ${candidateTitle}`,
            metadata: { downloadUrl },
          })
          return { hash, candidateTitle }
        }),

      grabBestRecentEpisodeRelease: grabBestEpisodeFromReleases,

      // ── TV: season ──

      searchAndGrabSeason: grabSeason,

      // ── TV: series ──

      searchAndGrabSeries: (seriesId) =>
        Effect.gen(function* () {
          const details = yield* seriesService.getById(seriesId)
          const s = details.series
          if (!s.monitored) {
            return yield* new AcquisitionError({
              mediaKind: "series",
              mediaId: seriesId,
              stage: "search",
              message: "series not monitored",
            })
          }
          if (s.qualityProfileId === null) {
            return yield* new AcquisitionError({
              mediaKind: "series",
              mediaId: seriesId,
              stage: "search",
              message: "no quality profile assigned",
            })
          }

          const results: Array<GrabResult> = []
          for (const sWithEps of details.seasons) {
            const seasonRow = sWithEps.season
            if (!seasonRow.monitored) continue
            const wanted = wantedEpisodes(sWithEps.episodes)
            if (wanted.length === 0) continue

            const seasonResults = yield* grabSeason(seasonRow.id).pipe(
              Effect.catchAll((err) =>
                Effect.logWarning(
                  `searchAndGrabSeries: season ${seasonRow.id} failed: ${JSON.stringify(err)}`,
                ).pipe(Effect.as<ReadonlyArray<GrabResult>>([])),
              ),
            )
            results.push(...seasonResults)
          }

          return results
        }),
    }
  }),
)
