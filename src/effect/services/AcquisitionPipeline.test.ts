import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import type { ReleaseCandidate } from "#/effect/domain/indexer"
import type { RankedDecision } from "#/effect/domain/release"
import { TestDbLive } from "#/effect/test/TestDb"

import { qualityProfiles } from "#/db/schema"
import { Db } from "#/effect/services/Db"

import { AcquisitionPipeline, AcquisitionPipelineLive } from "./AcquisitionPipeline"
import { DownloadClientService } from "./DownloadClientService"
import { IndexerService } from "./IndexerService"
import { MovieService, MovieServiceLive } from "./MovieService"
import { ReleasePolicyEngine } from "./ReleasePolicyEngine"

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
  search: () =>
    Effect.succeed({ releases: [mockCandidate], errors: [] }),
})

const MockIndexerServiceEmpty = Layer.succeed(IndexerService, {
  add: () => Effect.die("not implemented"),
  list: () => Effect.die("not implemented"),
  getById: () => Effect.die("not implemented"),
  update: () => Effect.die("not implemented"),
  remove: () => Effect.die("not implemented"),
  testConnection: () => Effect.die("not implemented"),
  search: () => Effect.succeed({ releases: [], errors: [] }),
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
).pipe(Layer.provideMerge(TestDbLive))

const TestLayer = AcquisitionPipelineLive.pipe(Layer.provideMerge(BaseLayer))

const EmptySearchLayer = AcquisitionPipelineLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      MockDownloadClientService,
      MockReleasePolicyEngine,
      MockIndexerServiceEmpty,
      MovieServiceLive,
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
