import { and, desc, eq, gt, isNotNull, isNull, lt, lte, or } from "drizzle-orm"
import { Effect, Schedule } from "effect"

import {
  episodes,
  movies,
  qualityProfiles,
  schedulerConfig,
  schedulerJobs,
  seasons,
  series,
} from "#/db/schema"
import {
  DEFAULT_AIR_DATE_DELAY_MINUTES,
  type SchedulerJobPayload,
  type SchedulerJobType,
} from "#/effect/domain/scheduler"

import { AcquisitionPipeline } from "./AcquisitionPipeline"
import { BackupService } from "./BackupService"
import { Db } from "./Db"
import { DownloadMonitor } from "./DownloadMonitor"
import { IndexerApplicationService } from "./IndexerApplicationService"
import { IndexerDefinitionSourceService } from "./IndexerDefinitionSourceService"
import { IndexerService } from "./IndexerService"
import { MaintenanceService } from "./MaintenanceService"
import { MetadataRefreshService } from "./MetadataRefreshService"
import { MovieService } from "./MovieService"
import { SchedulerService } from "./SchedulerService"

export const movieCutoffSearchCandidates = Effect.gen(function* () {
  const db = yield* Db
  return yield* db
    .select({ id: movies.id })
    .from(movies)
    .innerJoin(qualityProfiles, eq(movies.qualityProfileId, qualityProfiles.id))
    .where(
      and(
        eq(movies.status, "available"),
        eq(movies.monitored, true),
        eq(movies.hasFile, true),
        eq(qualityProfiles.upgradeAllowed, true),
        gt(qualityProfiles.cutoffFormatScore, 0),
        or(
          isNull(movies.existingFormatScore),
          lt(movies.existingFormatScore, qualityProfiles.cutoffFormatScore),
        ),
      ),
    )
})

export const episodeCutoffSearchCandidates = Effect.gen(function* () {
  const db = yield* Db
  return yield* db
    .select({ id: episodes.id })
    .from(episodes)
    .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
    .innerJoin(series, eq(seasons.seriesId, series.id))
    .innerJoin(qualityProfiles, eq(series.qualityProfileId, qualityProfiles.id))
    .where(
      and(
        eq(episodes.hasFile, true),
        eq(episodes.monitored, true),
        eq(seasons.monitored, true),
        eq(series.monitored, true),
        eq(qualityProfiles.upgradeAllowed, true),
        gt(qualityProfiles.cutoffFormatScore, 0),
        or(
          isNull(episodes.existingFormatScore),
          lt(episodes.existingFormatScore, qualityProfiles.cutoffFormatScore),
        ),
      ),
    )
})

// ── Tick: enqueue recurring + claim & dispatch ──

const tick = Effect.gen(function* () {
  const db = yield* Db
  const scheduler = yield* SchedulerService
  const pipeline = yield* AcquisitionPipeline
  const backups = yield* BackupService
  const monitor = yield* DownloadMonitor
  const indexers = yield* IndexerService
  const indexerApplications = yield* IndexerApplicationService
  const definitionSources = yield* IndexerDefinitionSourceService
  const maintenance = yield* MaintenanceService
  const metadataRefresh = yield* MetadataRefreshService
  const movieService = yield* MovieService

  // 1. Enqueue recurring jobs
  const configs = yield* db.select().from(schedulerConfig)
  const now = Date.now()

  for (const cfg of configs) {
    if (!cfg.enabled || cfg.intervalMinutes <= 0) continue

    // Check last completed job of this type
    const lastRows = yield* db
      .select({ completedAt: schedulerJobs.completedAt })
      .from(schedulerJobs)
      .where(eq(schedulerJobs.jobType, cfg.jobType))
      .orderBy(desc(schedulerJobs.completedAt))
      .limit(1)

    const lastCompleted = lastRows[0]?.completedAt
    const intervalMs = cfg.intervalMinutes * 60_000
    const shouldEnqueue = !lastCompleted || now - lastCompleted.getTime() >= intervalMs

    if (shouldEnqueue) {
      const payload = payloadForType(cfg.jobType)
      if (payload) {
        yield* scheduler.enqueue(payload).pipe(Effect.catchAll(() => Effect.succeed(null)))
      }
    }
  }

  // 2. Claim & execute one job per tick
  const job = yield* scheduler.claimNext()
  if (!job) return

  yield* Effect.gen(function* () {
    const payload = job.payload

    switch (payload._tag) {
      case "rss_sync": {
        const { releases } = yield* indexers.rss()
        const wantedMovies = yield* movieService.list({ status: "wanted", monitored: true })
        for (const movie of wantedMovies) {
          if (movie.qualityProfileId === null) continue
          yield* pipeline
            .grabBestRecentMovieRelease(movie.id, releases)
            .pipe(
              Effect.catchAll((e) =>
                Effect.logWarning(`rss_sync movie ${movie.id} failed: ${e._tag}`),
              ),
            )
        }
        break
      }
      case "search_missing": {
        yield* pipeline.searchAndGrab(payload.movieId)
        break
      }
      case "search_cutoff": {
        // Movies with file but format score below profile cutoff — handled by searchAndGrab's
        // upgrade path.
        const cutoffMovies = yield* movieCutoffSearchCandidates
        for (const movie of cutoffMovies) {
          yield* pipeline
            .searchAndGrab(movie.id)
            .pipe(
              Effect.catchAll((e) =>
                Effect.logWarning(`search_cutoff movie ${movie.id} failed: ${e._tag}`),
              ),
            )
        }
        break
      }
      case "download_monitor": {
        const completions = yield* monitor.checkCompletions()
        if (completions.length > 0) {
          yield* Effect.log(`download_monitor: ${completions.length} completed`)
        }
        break
      }
      case "indexer_definition_refresh": {
        const summary = yield* definitionSources.refreshEnabled()
        yield* Effect.log(
          `indexer_definition_refresh: ${summary.succeeded} refreshed, ${summary.failed} failed`,
        )
        break
      }
      case "indexer_application_sync": {
        const summary = yield* indexerApplications.syncEnabled()
        yield* Effect.log(
          `indexer_application_sync: ${summary.succeeded} synced, ${summary.failed} failed`,
        )
        break
      }
      case "movie_metadata_refresh": {
        const summary = yield* metadataRefresh.refreshAllMovies()
        yield* Effect.log(
          `movie_metadata_refresh: ${summary.refreshed} refreshed, ${summary.failed} failed`,
        )
        break
      }
      case "series_metadata_refresh": {
        const summary = yield* metadataRefresh.refreshAllSeries()
        yield* Effect.log(
          `series_metadata_refresh: ${summary.refreshed} refreshed, ${summary.skipped} skipped, ${summary.failed} failed`,
        )
        break
      }
      case "database_backup": {
        const backup = yield* backups.createDatabaseBackup()
        yield* Effect.log(`database_backup: wrote ${backup.backupPath}`)
        break
      }
      case "housekeeping": {
        const summary = yield* maintenance.runHousekeeping()
        yield* Effect.log(
          `housekeeping: ${summary.schedulerJobsDeleted} jobs, ${summary.notificationDeliveriesDeleted} notifications, ${summary.releaseDecisionsDeleted} decisions, ${summary.releaseBlocklistDeleted} blocklist, ${summary.recentReleasesDeleted} recent releases, ${summary.queueRowsDeleted} queue, ${summary.expiredSessionsDeleted} sessions deleted`,
        )
        break
      }
      case "tv_rss_sync": {
        const { releases } = yield* indexers.rss()
        // For each monitored, wanted episode whose air_date is sufficiently past, evaluate RSS.
        const airCutoff = new Date(Date.now() - DEFAULT_AIR_DATE_DELAY_MINUTES * 60_000)
        const wantedEpisodes = yield* db
          .select({ id: episodes.id })
          .from(episodes)
          .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
          .innerJoin(series, eq(seasons.seriesId, series.id))
          .where(
            and(
              eq(episodes.hasFile, false),
              eq(episodes.monitored, true),
              eq(seasons.monitored, true),
              eq(series.monitored, true),
              isNotNull(series.qualityProfileId),
              or(isNull(episodes.airDate), lte(episodes.airDate, airCutoff)),
            ),
          )
        for (const row of wantedEpisodes) {
          yield* pipeline
            .grabBestRecentEpisodeRelease(row.id, releases)
            .pipe(
              Effect.catchAll((e) =>
                Effect.logWarning(`tv_rss_sync episode ${row.id} failed: ${e._tag}`),
              ),
            )
        }
        break
      }
      case "tv_search_cutoff": {
        const availableEps = yield* episodeCutoffSearchCandidates
        for (const row of availableEps) {
          yield* pipeline
            .searchAndGrabEpisode(row.id)
            .pipe(
              Effect.catchAll((e) =>
                Effect.logWarning(`tv_search_cutoff episode ${row.id} failed: ${e._tag}`),
              ),
            )
        }
        break
      }
      case "tv_search_series": {
        yield* pipeline.searchAndGrabSeries(payload.seriesId)
        break
      }
      case "tv_search_season": {
        yield* pipeline.searchAndGrabSeason(payload.seasonId)
        break
      }
      case "tv_search_episode": {
        yield* pipeline.searchAndGrabEpisode(payload.episodeId)
        break
      }
    }

    yield* scheduler.complete(job.id)
  }).pipe(
    Effect.catchAll((e) =>
      scheduler
        .fail(job.id, String(e))
        .pipe(
          Effect.catchAll((failErr) =>
            Effect.logError(`scheduler.fail itself errored: ${failErr}`),
          ),
        ),
    ),
  )
})

function payloadForType(jobType: SchedulerJobType): SchedulerJobPayload | null {
  switch (jobType) {
    case "rss_sync":
      return { _tag: "rss_sync" }
    case "download_monitor":
      return { _tag: "download_monitor" }
    case "indexer_definition_refresh":
      return { _tag: "indexer_definition_refresh" }
    case "indexer_application_sync":
      return { _tag: "indexer_application_sync" }
    case "movie_metadata_refresh":
      return { _tag: "movie_metadata_refresh" }
    case "series_metadata_refresh":
      return { _tag: "series_metadata_refresh" }
    case "database_backup":
      return { _tag: "database_backup" }
    case "housekeeping":
      return { _tag: "housekeeping" }
    case "search_cutoff":
      return { _tag: "search_cutoff" }
    case "search_missing":
      // Manual-only — don't auto-enqueue
      return null
    case "tv_rss_sync":
      return { _tag: "tv_rss_sync" }
    case "tv_search_cutoff":
      return { _tag: "tv_search_cutoff" }
    case "tv_search_series":
    case "tv_search_season":
    case "tv_search_episode":
      return null
  }
}

// ── Exported loop ──

export const createSchedulerLoop = () =>
  Effect.gen(function* () {
    yield* Effect.log("[scheduler] loop starting")
    yield* tick.pipe(
      Effect.catchAllDefect((d) => Effect.logError(`[scheduler] defect: ${d}`)),
      Effect.repeat(Schedule.spaced("5 seconds")),
    )
  })
