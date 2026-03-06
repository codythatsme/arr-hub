import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import { customFormats, customFormatSpecs, customFormatScores } from "#/db/schema"
import type { ReleaseCandidate } from "#/effect/domain/indexer"
import type { EvaluationContext, ExistingFile } from "#/effect/domain/release"
import { TestDbLive } from "#/effect/test/TestDb"

import { Db } from "./Db"
import { ProfileService, ProfileServiceLive } from "./ProfileService"
import { ReleasePolicyEngine, ReleasePolicyEngineLive } from "./ReleasePolicyEngine"
import { TitleParserServiceLive } from "./TitleParserService"

const TestLayer = Layer.mergeAll(ReleasePolicyEngineLive).pipe(
  Layer.provideMerge(TitleParserServiceLive),
  Layer.provideMerge(ProfileServiceLive),
  Layer.provideMerge(TestDbLive),
)

function makeCandidate(overrides: Partial<ReleaseCandidate> & { title: string }): ReleaseCandidate {
  return {
    indexerId: 1,
    indexerName: "TestIndexer",
    indexerPriority: 50,
    size: 1_000_000_000,
    seeders: 100,
    leechers: 10,
    age: 1,
    downloadUrl: "https://example.com/dl",
    infoUrl: null,
    category: "Movies",
    protocol: "torrent",
    publishedAt: new Date(),
    infohash: null,
    downloadFactor: 1,
    uploadFactor: 1,
    ...overrides,
  }
}

const baseContext: EvaluationContext = { mediaId: 1, mediaType: "movie" }

/** Create a profile with standard quality items. Returns profileId. */
function setupProfile(opts?: {
  upgradeAllowed?: boolean
  minFormatScore?: number
  cutoffFormatScore?: number
  minUpgradeFormatScore?: number
}) {
  return Effect.gen(function* () {
    const svc = yield* ProfileService
    const result = yield* svc.create({
      name: "Test Profile",
      upgradeAllowed: opts?.upgradeAllowed ?? false,
      minFormatScore: opts?.minFormatScore ?? 0,
      cutoffFormatScore: opts?.cutoffFormatScore ?? 0,
      minUpgradeFormatScore: opts?.minUpgradeFormatScore ?? 1,
      qualityItems: [
        { qualityName: "SDTV", groupName: null, weight: 1, allowed: true },
        { qualityName: "HDTV720p", groupName: null, weight: 2, allowed: true },
        { qualityName: "WEBDL720p", groupName: null, weight: 3, allowed: true },
        { qualityName: "HDTV1080p", groupName: null, weight: 4, allowed: true },
        { qualityName: "WEBDL1080p", groupName: null, weight: 5, allowed: true },
        { qualityName: "Bluray1080p", groupName: null, weight: 6, allowed: true },
        { qualityName: "Remux1080p", groupName: null, weight: 7, allowed: true },
        { qualityName: "WEBDL2160p", groupName: null, weight: 8, allowed: true },
        { qualityName: "Bluray2160p", groupName: null, weight: 9, allowed: true },
        { qualityName: "Remux2160p", groupName: null, weight: 10, allowed: true },
      ],
    })
    return result.profile.id
  })
}

describe("ReleasePolicyEngine", () => {
  it.effect("accepts release with allowed quality, no existing file", () =>
    Effect.gen(function* () {
      const profileId = yield* setupProfile()
      const engine = yield* ReleasePolicyEngine
      const results = yield* engine.evaluate(
        [makeCandidate({ title: "Movie.2024.1080p.BluRay.x264-GRP" })],
        profileId,
        baseContext,
      )
      expect(results).toHaveLength(1)
      expect(results[0].decision).toBe("accepted")
      expect(results[0].qualityRank).toBe(6)
      expect(results[0].parsed?.qualityName).toBe("Bluray1080p")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("rejects quality not in allowed list", () =>
    Effect.gen(function* () {
      const svc = yield* ProfileService
      // Profile only allows Bluray1080p
      const result = yield* svc.create({
        name: "Restricted",
        qualityItems: [{ qualityName: "Bluray1080p", groupName: null, weight: 1, allowed: true }],
      })
      const engine = yield* ReleasePolicyEngine
      const results = yield* engine.evaluate(
        [makeCandidate({ title: "Movie.2024.720p.HDTV.x264-GRP" })],
        result.profile.id,
        baseContext,
      )
      expect(results).toHaveLength(1)
      expect(results[0].decision).toBe("rejected")
      expect(results[0].reasons[0].rule).toBe("quality_not_allowed")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("rejects format score below minFormatScore via negative format", () =>
    Effect.gen(function* () {
      const db = yield* Db
      const profileId = yield* setupProfile({ minFormatScore: 0 })

      // Create BR-DISK custom format with -10000 score
      const [fmt] = yield* db.insert(customFormats).values({ name: "BR-DISK" }).returning()
      yield* db.insert(customFormatSpecs).values({
        customFormatId: fmt.id,
        name: "BR-DISK detect",
        field: "source" as const,
        pattern: "bluray",
        negate: false,
        required: true,
      })
      yield* db.insert(customFormatScores).values({
        profileId,
        customFormatId: fmt.id,
        score: -10000,
      })

      // Re-read profile to pick up scores
      const svc = yield* ProfileService
      yield* svc.update(profileId, { minFormatScore: -1 })

      const engine = yield* ReleasePolicyEngine
      const results = yield* engine.evaluate(
        [makeCandidate({ title: "Movie.2024.1080p.BluRay.x264-GRP" })],
        profileId,
        baseContext,
      )
      expect(results).toHaveLength(1)
      // The format score is -10000, which is below the minFormatScore of -1
      expect(results[0].decision).toBe("rejected")
      expect(results[0].reasons[0].rule).toBe("format_score_below_min")
      expect(results[0].formatScore).toBe(-10000)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("applies positive format scoring (x265 boost)", () =>
    Effect.gen(function* () {
      const db = yield* Db
      const profileId = yield* setupProfile()

      // Create x265 custom format with +1000 score
      const [fmt] = yield* db.insert(customFormats).values({ name: "x265" }).returning()
      yield* db.insert(customFormatSpecs).values({
        customFormatId: fmt.id,
        name: "x265 detect",
        field: "releaseTitle" as const,
        pattern: "x265|hevc",
        negate: false,
        required: true,
      })
      yield* db.insert(customFormatScores).values({
        profileId,
        customFormatId: fmt.id,
        score: 1000,
      })

      const engine = yield* ReleasePolicyEngine
      const results = yield* engine.evaluate(
        [makeCandidate({ title: "Movie.2024.1080p.BluRay.x265-GRP" })],
        profileId,
        baseContext,
      )
      expect(results).toHaveLength(1)
      expect(results[0].formatScore).toBe(1000)
      expect(results[0].decision).toBe("accepted")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("upgrade accepted: better quality rank", () =>
    Effect.gen(function* () {
      const profileId = yield* setupProfile({ upgradeAllowed: true })
      const existing: ExistingFile = { qualityName: "HDTV720p", qualityRank: 2, formatScore: 0 }
      const engine = yield* ReleasePolicyEngine
      const results = yield* engine.evaluate(
        [makeCandidate({ title: "Movie.2024.1080p.BluRay.x264-GRP" })],
        profileId,
        { ...baseContext, existingFile: existing },
      )
      expect(results).toHaveLength(1)
      expect(results[0].decision).toBe("upgrade")
      expect(results[0].reasons.some((r) => r.rule === "quality_upgrade")).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("upgrade blocked: upgradeAllowed=false", () =>
    Effect.gen(function* () {
      const profileId = yield* setupProfile({ upgradeAllowed: false })
      const existing: ExistingFile = { qualityName: "HDTV720p", qualityRank: 2, formatScore: 0 }
      const engine = yield* ReleasePolicyEngine
      const results = yield* engine.evaluate(
        [makeCandidate({ title: "Movie.2024.1080p.BluRay.x264-GRP" })],
        profileId,
        { ...baseContext, existingFile: existing },
      )
      expect(results).toHaveLength(1)
      expect(results[0].decision).toBe("skipped")
      expect(results[0].reasons.some((r) => r.rule === "upgrades_disabled")).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("upgrade blocked: format score at cutoff", () =>
    Effect.gen(function* () {
      const profileId = yield* setupProfile({
        upgradeAllowed: true,
        cutoffFormatScore: 500,
      })
      // Same quality rank, existing already at cutoff
      const existing: ExistingFile = {
        qualityName: "Bluray1080p",
        qualityRank: 6,
        formatScore: 500,
      }
      const engine = yield* ReleasePolicyEngine
      const results = yield* engine.evaluate(
        [makeCandidate({ title: "Movie.2024.1080p.BluRay.x264-GRP" })],
        profileId,
        { ...baseContext, existingFile: existing },
      )
      expect(results).toHaveLength(1)
      expect(results[0].decision).toBe("skipped")
      expect(
        results[0].reasons.some(
          (r) => r.rule === "format_score_not_improved" || r.rule === "format_score_at_cutoff",
        ),
      ).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("upgrade blocked: below minUpgradeFormatScore threshold", () =>
    Effect.gen(function* () {
      const db = yield* Db
      const profileId = yield* setupProfile({
        upgradeAllowed: true,
        cutoffFormatScore: 10000,
        minUpgradeFormatScore: 500,
      })

      // Create a small boost format
      const [fmt] = yield* db.insert(customFormats).values({ name: "SmallBoost" }).returning()
      yield* db.insert(customFormatSpecs).values({
        customFormatId: fmt.id,
        name: "detect",
        field: "releaseTitle" as const,
        pattern: "x264",
        negate: false,
        required: true,
      })
      yield* db.insert(customFormatScores).values({
        profileId,
        customFormatId: fmt.id,
        score: 100,
      })

      // Existing has formatScore=0, new will get 100, but minUpgrade is 500
      const existing: ExistingFile = {
        qualityName: "Bluray1080p",
        qualityRank: 6,
        formatScore: 0,
      }
      const engine = yield* ReleasePolicyEngine
      const results = yield* engine.evaluate(
        [makeCandidate({ title: "Movie.2024.1080p.BluRay.x264-GRP" })],
        profileId,
        { ...baseContext, existingFile: existing },
      )
      expect(results).toHaveLength(1)
      expect(results[0].decision).toBe("skipped")
      expect(results[0].reasons.some((r) => r.rule === "below_min_upgrade_score")).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect(
    "lexicographic ranking: quality primary, format score secondary, seeders tertiary",
    () =>
      Effect.gen(function* () {
        const profileId = yield* setupProfile()
        const engine = yield* ReleasePolicyEngine

        const candidates = [
          makeCandidate({ title: "Movie.2024.720p.HDTV.x264-LOW", seeders: 1000 }),
          makeCandidate({ title: "Movie.2024.1080p.BluRay.x264-MED", seeders: 50 }),
          makeCandidate({ title: "Movie.2024.1080p.BluRay.x264-HIGH", seeders: 200 }),
        ]

        const results = yield* engine.evaluate(candidates, profileId, baseContext)
        expect(results).toHaveLength(3)

        // Higher weight = better quality. Bluray1080p(6) > HDTV720p(2).
        // Between two Bluray1080p: same rank → seeders DESC (200 > 50).
        expect(results[0].candidate.title).toContain("HIGH") // Bluray1080p, 200 seeders
        expect(results[1].candidate.title).toContain("MED") // Bluray1080p, 50 seeders
        expect(results[2].candidate.title).toContain("LOW") // HDTV720p, 1000 seeders
      }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("deterministic: same inputs same output", () =>
    Effect.gen(function* () {
      const profileId = yield* setupProfile()
      const engine = yield* ReleasePolicyEngine
      const candidates = [
        makeCandidate({ title: "Movie.2024.1080p.BluRay.x264-A", seeders: 100 }),
        makeCandidate({ title: "Movie.2024.720p.HDTV.x264-B", seeders: 200 }),
      ]
      const run1 = yield* engine.evaluate(candidates, profileId, baseContext)
      const run2 = yield* engine.evaluate(candidates, profileId, baseContext)
      expect(run1.map((r) => r.candidate.title)).toEqual(run2.map((r) => r.candidate.title))
      expect(run1.map((r) => r.decision)).toEqual(run2.map((r) => r.decision))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("reason annotations correct for accepted decision", () =>
    Effect.gen(function* () {
      const profileId = yield* setupProfile()
      const engine = yield* ReleasePolicyEngine
      const results = yield* engine.evaluate(
        [makeCandidate({ title: "Movie.2024.1080p.BluRay.x264-GRP" })],
        profileId,
        baseContext,
      )
      expect(results[0].decision).toBe("accepted")
      expect(results[0].reasons.some((r) => r.stage === "score")).toBe(true)
      expect(results[0].reasons.some((r) => r.stage === "rank")).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("recordDecisions persists and history retrieves", () =>
    Effect.gen(function* () {
      const profileId = yield* setupProfile()
      const engine = yield* ReleasePolicyEngine
      const results = yield* engine.evaluate(
        [makeCandidate({ title: "Movie.2024.1080p.BluRay.x264-GRP" })],
        profileId,
        baseContext,
      )
      yield* engine.recordDecisions(results, baseContext)
      const history = yield* engine.history(1, "movie")
      expect(history).toHaveLength(1)
      expect(history[0].decision).toBe("accepted")
      expect(history[0].candidateTitle).toBe("Movie.2024.1080p.BluRay.x264-GRP")
    }).pipe(Effect.provide(TestLayer)),
  )
})
