import { describe, expect, it } from "@effect/vitest"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"

import { downloadClients, downloadQueue, qualityProfiles } from "#/db/schema"
import type { ReleaseCandidate, SearchQuery, SearchResult } from "#/effect/domain/indexer"
import type { ParsedTitle, RankedDecision } from "#/effect/domain/release"
import { Db } from "#/effect/services/Db"
import { TestDbLive } from "#/effect/test/TestDb"

import { AcquisitionPipeline, AcquisitionPipelineLive } from "./AcquisitionPipeline"
import { AdapterRegistryLive } from "./AdapterRegistry"
import { DownloadClientService } from "./DownloadClientService"
import { IndexerService } from "./IndexerService"
import { MovieService, MovieServiceLive } from "./MovieService"
import { ReleasePolicyEngine } from "./ReleasePolicyEngine"
import { SeriesService, SeriesServiceLive } from "./SeriesService"

// ── Mock candidates ──

const mockCandidate: ReleaseCandidate = {
  title: "Test.Movie.2024.1080p.BluRay.x264-GROUP",
  indexerId: 1,
  indexerName: "test-indexer",
  indexerPriority: 50,
  size: 1_500_000_000,
  seeders: 100,
  leechers: 10,
  age: 1,
  downloadUrl: "magnet:?xt=urn:btih:abc123",
  infoUrl: null,
  category: "2000",
  protocol: "torrent",
  publishedAt: new Date(),
  infohash: "abc123",
  downloadFactor: 1,
  uploadFactor: 1,
}

// ── Mock layers ──

const MockIndexerService = Layer.succeed(IndexerService, {
  add: () => Effect.die("not implemented"),
  list: () => Effect.die("not implemented"),
  getById: () => Effect.die("not implemented"),
  update: () => Effect.die("not implemented"),
  remove: () => Effect.die("not implemented"),
  testConnection: () => Effect.die("not implemented"),
  search: () => Effect.succeed({ releases: [mockCandidate], errors: [] }),
  listTypes: () => [],
})

const MockIndexerServiceEmpty = Layer.succeed(IndexerService, {
  add: () => Effect.die("not implemented"),
  list: () => Effect.die("not implemented"),
  getById: () => Effect.die("not implemented"),
  update: () => Effect.die("not implemented"),
  remove: () => Effect.die("not implemented"),
  testConnection: () => Effect.die("not implemented"),
  search: () => Effect.succeed({ releases: [], errors: [] }),
  listTypes: () => [],
})

const MockDownloadClientService = Layer.succeed(DownloadClientService, {
  add: () => Effect.die("not implemented"),
  list: () =>
    Effect.succeed([
      {
        id: 1,
        name: "test-qbit",
        type: "qbittorrent",
        host: "localhost",
        port: 8080,
        username: "admin",
        useSsl: false,
        category: null,
        priority: 50,
        enabled: true,
        settings: { pollIntervalMs: 5000 },
        createdAt: new Date(),
        updatedAt: new Date(),
        health: null,
      },
    ]),
  getById: () => Effect.die("not implemented"),
  update: () => Effect.die("not implemented"),
  remove: () => Effect.die("not implemented"),
  testConnection: () => Effect.die("not implemented"),
  addDownload: () => Effect.succeed("hash_abc123"),
  getQueue: () => Effect.die("not implemented"),
  removeDownload: () => Effect.die("not implemented"),
  listTypes: () => [],
})

const MockReleasePolicyEngine = Layer.succeed(ReleasePolicyEngine, {
  evaluate: (candidates) =>
    Effect.succeed(
      candidates.map(
        (c): RankedDecision => ({
          candidate: c,
          parsed: null,
          qualityRank: 10,
          formatScore: 100,
          decision: "accepted",
          reasons: [{ stage: "rank", rule: "accepted", detail: "mock" }],
        }),
      ),
    ),
  recordDecisions: () => Effect.void,
  history: () => Effect.succeed([]),
})

const MockReleasePolicyEngineRejected = Layer.succeed(ReleasePolicyEngine, {
  evaluate: (candidates) =>
    Effect.succeed(
      candidates.map(
        (c): RankedDecision => ({
          candidate: c,
          parsed: null,
          qualityRank: null,
          formatScore: 0,
          decision: "rejected",
          reasons: [{ stage: "filter", rule: "rejected", detail: "mock" }],
        }),
      ),
    ),
  recordDecisions: () => Effect.void,
  history: () => Effect.succeed([]),
})

// ── Test layers ──

const BaseLayer = Layer.mergeAll(
  MockDownloadClientService,
  MockReleasePolicyEngine,
  MockIndexerService,
  MovieServiceLive,
  SeriesServiceLive,
  AdapterRegistryLive,
).pipe(Layer.provideMerge(TestDbLive))

const TestLayer = AcquisitionPipelineLive.pipe(Layer.provideMerge(BaseLayer))

const EmptySearchLayer = AcquisitionPipelineLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      MockDownloadClientService,
      MockReleasePolicyEngine,
      MockIndexerServiceEmpty,
      MovieServiceLive,
      SeriesServiceLive,
      AdapterRegistryLive,
    ).pipe(Layer.provideMerge(TestDbLive)),
  ),
)

const RejectedLayer = AcquisitionPipelineLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      MockDownloadClientService,
      MockReleasePolicyEngineRejected,
      MockIndexerService,
      MovieServiceLive,
      SeriesServiceLive,
      AdapterRegistryLive,
    ).pipe(Layer.provideMerge(TestDbLive)),
  ),
)

// ── Helpers ──

function seedProfile() {
  return Effect.gen(function* () {
    const db = yield* Db
    yield* db.insert(qualityProfiles).values({ name: "test-profile" })
  })
}

function addTestMovie(profileId?: number) {
  return Effect.gen(function* () {
    if (profileId !== undefined) yield* seedProfile()
    const svc = yield* MovieService
    return yield* svc.add({
      tmdbId: 12345,
      title: "Test Movie",
      year: 2024,
      qualityProfileId: profileId ?? null,
      monitored: true,
    })
  })
}

// ── Tests ──

describe("AcquisitionPipeline", () => {
  it.effect("searchAndGrab returns grab result", () =>
    Effect.gen(function* () {
      const movie = yield* addTestMovie(1)
      const pipeline = yield* AcquisitionPipeline
      const result = yield* pipeline.searchAndGrab(movie.id)
      expect(result).not.toBeNull()
      expect(result?.hash).toBe("hash_abc123")
      expect(result?.candidateTitle).toBe(mockCandidate.title)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("searchAndGrab returns null when no releases", () =>
    Effect.gen(function* () {
      const movie = yield* addTestMovie(1)
      const pipeline = yield* AcquisitionPipeline
      const result = yield* pipeline.searchAndGrab(movie.id)
      expect(result).toBeNull()
    }).pipe(Effect.provide(EmptySearchLayer)),
  )

  it.effect("searchAndGrab returns null when all rejected", () =>
    Effect.gen(function* () {
      const movie = yield* addTestMovie(1)
      const pipeline = yield* AcquisitionPipeline
      const result = yield* pipeline.searchAndGrab(movie.id)
      expect(result).toBeNull()
    }).pipe(Effect.provide(RejectedLayer)),
  )

  it.effect("searchAndGrab fails for unmonitored movie", () =>
    Effect.gen(function* () {
      yield* seedProfile()
      const svc = yield* MovieService
      const movie = yield* svc.add({
        tmdbId: 99999,
        title: "Unmonitored",
        monitored: false,
        qualityProfileId: 1,
      })
      const pipeline = yield* AcquisitionPipeline
      const error = yield* Effect.flip(pipeline.searchAndGrab(movie.id))
      expect(error._tag).toBe("AcquisitionError")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("searchAndGrab fails for movie without quality profile", () =>
    Effect.gen(function* () {
      const movie = yield* addTestMovie()
      const pipeline = yield* AcquisitionPipeline
      const error = yield* Effect.flip(pipeline.searchAndGrab(movie.id))
      expect(error._tag).toBe("AcquisitionError")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("searchAndEvaluate returns decisions", () =>
    Effect.gen(function* () {
      const movie = yield* addTestMovie(1)
      const pipeline = yield* AcquisitionPipeline
      const decisions = yield* pipeline.searchAndEvaluate(movie.id)
      expect(decisions).toHaveLength(1)
      expect(decisions[0].decision).toBe("accepted")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("grab returns hash and title", () =>
    Effect.gen(function* () {
      const movie = yield* addTestMovie(1)
      const pipeline = yield* AcquisitionPipeline
      const result = yield* pipeline.grab(movie.id, "magnet:?xt=test", "Some.Release")
      expect(result.hash).toBe("hash_abc123")
      expect(result.candidateTitle).toBe("Some.Release")
    }).pipe(Effect.provide(TestLayer)),
  )
})

// ── TV mock candidates ──

const packCandidate: ReleaseCandidate = {
  title: "Test.Show.S01.1080p.BluRay.x264-GROUP",
  indexerId: 1,
  indexerName: "test-indexer",
  indexerPriority: 50,
  size: 8_000_000_000,
  seeders: 50,
  leechers: 5,
  age: 30,
  downloadUrl: "magnet:?xt=urn:btih:pack",
  infoUrl: null,
  category: "5030",
  protocol: "torrent",
  publishedAt: new Date(),
  infohash: "pack",
  downloadFactor: 1,
  uploadFactor: 1,
}

const episodeCandidate: ReleaseCandidate = {
  title: "Test.Show.S01E01.1080p.WEB-DL.x264-GROUP",
  indexerId: 1,
  indexerName: "test-indexer",
  indexerPriority: 50,
  size: 1_500_000_000,
  seeders: 100,
  leechers: 10,
  age: 1,
  downloadUrl: "magnet:?xt=urn:btih:ep1",
  infoUrl: null,
  category: "5030",
  protocol: "torrent",
  publishedAt: new Date(),
  infohash: "ep1",
  downloadFactor: 1,
  uploadFactor: 1,
}

const episodeCandidate2: ReleaseCandidate = {
  ...episodeCandidate,
  title: "Test.Show.S01E02.1080p.WEB-DL.x264-GROUP",
  downloadUrl: "magnet:?xt=urn:btih:ep2",
  infohash: "ep2",
}

const packParsed: ParsedTitle = {
  title: "Test Show",
  year: null,
  season: 1,
  episode: null,
  resolution: 1080,
  source: "bluray",
  modifier: null,
  codec: "x264",
  releaseGroup: "GROUP",
  edition: null,
  proper: false,
  qualityName: "Bluray1080p",
}

const ep1Parsed: ParsedTitle = {
  title: "Test Show",
  year: null,
  season: 1,
  episode: 1,
  resolution: 1080,
  source: "webdl",
  modifier: null,
  codec: "x264",
  releaseGroup: "GROUP",
  edition: null,
  proper: false,
  qualityName: "WEBDL1080p",
}

const ep2Parsed: ParsedTitle = { ...ep1Parsed, episode: 2 }

// ── TV mock indexer: distinguishes pack vs episode search ──

const MockTvIndexerWithPack = Layer.succeed(IndexerService, {
  add: () => Effect.die("not implemented"),
  list: () => Effect.die("not implemented"),
  getById: () => Effect.die("not implemented"),
  update: () => Effect.die("not implemented"),
  remove: () => Effect.die("not implemented"),
  testConnection: () => Effect.die("not implemented"),
  search: (q: SearchQuery): Effect.Effect<SearchResult> => {
    if (q.type === "tv" && q.episode === undefined) {
      return Effect.succeed({ releases: [packCandidate], errors: [] })
    }
    if (q.type === "tv" && q.episode === 1) {
      return Effect.succeed({ releases: [episodeCandidate], errors: [] })
    }
    if (q.type === "tv" && q.episode === 2) {
      return Effect.succeed({ releases: [episodeCandidate2], errors: [] })
    }
    return Effect.succeed({ releases: [], errors: [] })
  },
  listTypes: () => [],
})

const MockTvIndexerEpisodesOnly = Layer.succeed(IndexerService, {
  add: () => Effect.die("not implemented"),
  list: () => Effect.die("not implemented"),
  getById: () => Effect.die("not implemented"),
  update: () => Effect.die("not implemented"),
  remove: () => Effect.die("not implemented"),
  testConnection: () => Effect.die("not implemented"),
  search: (q: SearchQuery): Effect.Effect<SearchResult> => {
    if (q.type === "tv" && q.episode === 1) {
      return Effect.succeed({ releases: [episodeCandidate], errors: [] })
    }
    if (q.type === "tv" && q.episode === 2) {
      return Effect.succeed({ releases: [episodeCandidate2], errors: [] })
    }
    return Effect.succeed({ releases: [], errors: [] })
  },
  listTypes: () => [],
})

// ── TV mock policy engine: returns parsed titles based on candidate title ──

const parsedByTitle = new Map<string, ParsedTitle>([
  [packCandidate.title, packParsed],
  [episodeCandidate.title, ep1Parsed],
  [episodeCandidate2.title, ep2Parsed],
])

const MockTvPolicyEngine = Layer.succeed(ReleasePolicyEngine, {
  evaluate: (candidates) =>
    Effect.succeed(
      candidates.map(
        (c): RankedDecision => ({
          candidate: c,
          parsed: parsedByTitle.get(c.title) ?? null,
          qualityRank: 10,
          formatScore: 100,
          decision: "accepted",
          reasons: [{ stage: "rank", rule: "accepted", detail: "mock" }],
        }),
      ),
    ),
  recordDecisions: () => Effect.void,
  history: () => Effect.succeed([]),
})

// ── TV mock download client that inserts queue rows (needed to verify link columns) ──

const InsertingDownloadClientService = Layer.effect(
  DownloadClientService,
  Effect.gen(function* () {
    const db = yield* Db
    let counter = 0
    return {
      add: () => Effect.die("not implemented"),
      list: () =>
        Effect.succeed([
          {
            id: 1,
            name: "test-qbit",
            type: "qbittorrent",
            host: "localhost",
            port: 8080,
            username: "admin",
            useSsl: false,
            category: null,
            priority: 50,
            enabled: true,
            settings: { pollIntervalMs: 5000 },
            createdAt: new Date(),
            updatedAt: new Date(),
            health: null,
          },
        ]),
      getById: () => Effect.die("not implemented"),
      update: () => Effect.die("not implemented"),
      remove: () => Effect.die("not implemented"),
      testConnection: () => Effect.die("not implemented"),
      addDownload: () =>
        Effect.gen(function* () {
          counter += 1
          const hash = `hash_${counter}`
          yield* db
            .insert(downloadClients)
            .values({
              id: 1,
              name: "test-qbit",
              type: "qbittorrent",
              host: "localhost",
              port: 8080,
              username: "admin",
              passwordEncrypted: "x",
              useSsl: false,
              priority: 50,
              enabled: true,
              settings: { pollIntervalMs: 5000 },
            })
            .onConflictDoNothing()
          yield* db.insert(downloadQueue).values({
            downloadClientId: 1,
            externalId: hash,
            status: "queued",
            title: "pending",
            sizeBytes: 0,
            progress: 0,
          })
          return hash
        }),
      getQueue: () => Effect.die("not implemented"),
      removeDownload: () => Effect.die("not implemented"),
      listTypes: () => [],
    }
  }),
)

// ── TV test layers ──

const TvPackLayer = AcquisitionPipelineLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      InsertingDownloadClientService,
      MockTvPolicyEngine,
      MockTvIndexerWithPack,
      MovieServiceLive,
      SeriesServiceLive,
      AdapterRegistryLive,
    ).pipe(Layer.provideMerge(TestDbLive)),
  ),
)

const TvEpisodeOnlyLayer = AcquisitionPipelineLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      InsertingDownloadClientService,
      MockTvPolicyEngine,
      MockTvIndexerEpisodesOnly,
      MovieServiceLive,
      SeriesServiceLive,
      AdapterRegistryLive,
    ).pipe(Layer.provideMerge(TestDbLive)),
  ),
)

// ── TV helpers ──

function addTestSeries(opts: {
  profileId: number | null
  monitored?: boolean
  seasonMonitored?: boolean
  epMonitored?: boolean
  epCount?: number
}) {
  return Effect.gen(function* () {
    if (opts.profileId !== null) {
      const db = yield* Db
      yield* db.insert(qualityProfiles).values({ name: "test-profile" })
    }
    const svc = yield* SeriesService
    const epCount = opts.epCount ?? 2
    const eps = Array.from({ length: epCount }, (_, i) => ({
      tvdbId: 10_000 + i + 1,
      title: `Episode ${i + 1}`,
      episodeNumber: i + 1,
      monitored: opts.epMonitored ?? true,
    }))
    return yield* svc.add({
      tvdbId: 500,
      title: "Test Show",
      qualityProfileId: opts.profileId,
      monitored: opts.monitored ?? true,
      seasons: [
        {
          seasonNumber: 1,
          monitored: opts.seasonMonitored ?? true,
          episodes: eps,
        },
      ],
    })
  })
}

// ── TV tests ──

describe("AcquisitionPipeline TV", () => {
  it.effect("searchAndGrabEpisode grabs best per-episode release", () =>
    Effect.gen(function* () {
      const series = yield* addTestSeries({ profileId: 1 })
      const epId = series.seasons[0].episodes[0].id
      const pipeline = yield* AcquisitionPipeline
      const result = yield* pipeline.searchAndGrabEpisode(epId)
      if (result === null) throw new Error("expected grab result, got null")
      expect(result.candidateTitle).toBe(episodeCandidate.title)

      const db = yield* Db
      const rows = yield* db
        .select()
        .from(downloadQueue)
        .where(eq(downloadQueue.externalId, result.hash))
      expect(rows).toHaveLength(1)
      expect(rows[0].seriesId).toBe(series.series.id)
      expect(rows[0].episodeIds).toEqual([epId])
    }).pipe(Effect.provide(TvPackLayer)),
  )

  it.effect("searchAndGrabEpisode returns null when no releases", () =>
    Effect.gen(function* () {
      // Mock only returns for episodes 1 and 2 — seed episode 3 to hit empty path
      const db = yield* Db
      yield* db.insert(qualityProfiles).values({ name: "test-profile" })
      const svc = yield* SeriesService
      const s = yield* svc.add({
        tvdbId: 501,
        title: "Other Show",
        qualityProfileId: 1,
        monitored: true,
        seasons: [
          {
            seasonNumber: 1,
            monitored: true,
            episodes: [{ tvdbId: 99_003, title: "Ep3", episodeNumber: 3, monitored: true }],
          },
        ],
      })
      const pipeline = yield* AcquisitionPipeline
      const result = yield* pipeline.searchAndGrabEpisode(s.seasons[0].episodes[0].id)
      expect(result).toBeNull()
    }).pipe(Effect.provide(TvEpisodeOnlyLayer)),
  )

  it.effect("searchAndGrabEpisode fails for unmonitored episode", () =>
    Effect.gen(function* () {
      const series = yield* addTestSeries({ profileId: 1, epMonitored: false })
      const epId = series.seasons[0].episodes[0].id
      const pipeline = yield* AcquisitionPipeline
      const error = yield* Effect.flip(pipeline.searchAndGrabEpisode(epId))
      expect(error._tag).toBe("AcquisitionError")
    }).pipe(Effect.provide(TvPackLayer)),
  )

  it.effect("searchAndGrabEpisode fails when series has no quality profile", () =>
    Effect.gen(function* () {
      const series = yield* addTestSeries({ profileId: null })
      const epId = series.seasons[0].episodes[0].id
      const pipeline = yield* AcquisitionPipeline
      const error = yield* Effect.flip(pipeline.searchAndGrabEpisode(epId))
      expect(error._tag).toBe("AcquisitionError")
    }).pipe(Effect.provide(TvPackLayer)),
  )

  it.effect("searchAndGrabSeason prefers season pack when available", () =>
    Effect.gen(function* () {
      const series = yield* addTestSeries({ profileId: 1, epCount: 2 })
      const seasonId = series.seasons[0].season.id
      const pipeline = yield* AcquisitionPipeline
      const results = yield* pipeline.searchAndGrabSeason(seasonId)

      // Pack-first → 1 grab result covering all wanted episodes
      expect(results).toHaveLength(1)
      expect(results[0].candidateTitle).toBe(packCandidate.title)

      // downloadQueue row should contain both episode ids
      const db = yield* Db
      const rows = yield* db.select().from(downloadQueue)
      expect(rows).toHaveLength(1)
      expect(rows[0].seriesId).toBe(series.series.id)
      const epIds = series.seasons[0].episodes.map((e) => e.id).toSorted()
      expect((rows[0].episodeIds ?? []).toSorted()).toEqual(epIds)
    }).pipe(Effect.provide(TvPackLayer)),
  )

  it.effect("searchAndGrabSeason falls back to per-episode when no pack", () =>
    Effect.gen(function* () {
      const series = yield* addTestSeries({ profileId: 1, epCount: 2 })
      const seasonId = series.seasons[0].season.id
      const pipeline = yield* AcquisitionPipeline
      const results = yield* pipeline.searchAndGrabSeason(seasonId)

      // Per-episode → 2 grab results
      expect(results).toHaveLength(2)
      const titles = results.map((r) => r.candidateTitle).toSorted()
      expect(titles).toEqual([episodeCandidate.title, episodeCandidate2.title].toSorted())
    }).pipe(Effect.provide(TvEpisodeOnlyLayer)),
  )

  it.effect("searchAndGrabSeason returns empty when no wanted episodes", () =>
    Effect.gen(function* () {
      const series = yield* addTestSeries({ profileId: 1, epMonitored: false })
      const seasonId = series.seasons[0].season.id
      const pipeline = yield* AcquisitionPipeline
      const results = yield* pipeline.searchAndGrabSeason(seasonId)
      expect(results).toHaveLength(0)
    }).pipe(Effect.provide(TvPackLayer)),
  )

  it.effect("searchAndGrabSeason fails for unmonitored season", () =>
    Effect.gen(function* () {
      const series = yield* addTestSeries({ profileId: 1, seasonMonitored: false })
      const seasonId = series.seasons[0].season.id
      const pipeline = yield* AcquisitionPipeline
      const error = yield* Effect.flip(pipeline.searchAndGrabSeason(seasonId))
      expect(error._tag).toBe("AcquisitionError")
      if (error._tag === "AcquisitionError") {
        expect(error.mediaKind).toBe("season")
      }
    }).pipe(Effect.provide(TvPackLayer)),
  )

  it.effect("searchAndGrabSeries iterates monitored seasons", () =>
    Effect.gen(function* () {
      const series = yield* addTestSeries({ profileId: 1, epCount: 2 })
      const pipeline = yield* AcquisitionPipeline
      const results = yield* pipeline.searchAndGrabSeries(series.series.id)
      // Pack-first across 1 season → 1 grab
      expect(results).toHaveLength(1)
      expect(results[0].candidateTitle).toBe(packCandidate.title)
    }).pipe(Effect.provide(TvPackLayer)),
  )

  it.effect("searchAndGrabSeries fails for unmonitored series", () =>
    Effect.gen(function* () {
      const series = yield* addTestSeries({ profileId: 1, monitored: false })
      const pipeline = yield* AcquisitionPipeline
      const error = yield* Effect.flip(pipeline.searchAndGrabSeries(series.series.id))
      expect(error._tag).toBe("AcquisitionError")
      if (error._tag === "AcquisitionError") {
        expect(error.mediaKind).toBe("series")
      }
    }).pipe(Effect.provide(TvPackLayer)),
  )

  it.effect("grabEpisode links queue to series and episode", () =>
    Effect.gen(function* () {
      const series = yield* addTestSeries({ profileId: 1 })
      const epId = series.seasons[0].episodes[0].id
      const pipeline = yield* AcquisitionPipeline
      const result = yield* pipeline.grabEpisode(epId, "magnet:?xt=test", "Custom.Release.Title")
      expect(result.candidateTitle).toBe("Custom.Release.Title")

      const db = yield* Db
      const rows = yield* db.select().from(downloadQueue)
      expect(rows).toHaveLength(1)
      expect(rows[0].seriesId).toBe(series.series.id)
      expect(rows[0].episodeIds).toEqual([epId])
    }).pipe(Effect.provide(TvPackLayer)),
  )
})
