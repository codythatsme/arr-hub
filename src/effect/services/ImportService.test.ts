import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"

import { episodes, seasons, series } from "#/db/schema"
import { Db } from "#/effect/services/Db"
import { OnboardingService } from "#/effect/services/OnboardingService"
import { TestDbLive } from "#/effect/test/TestDb"

import { ImportService, ImportServiceLive } from "./ImportService"

const unused = () => Effect.die("unused")

const onboardingLayer = (completed: boolean) =>
  Layer.succeed(OnboardingService, {
    getStatus: () =>
      Effect.succeed({
        started: true,
        completed,
        hasAdmin: true,
        path: "wizard" as const,
        currentStep: completed ? null : "import",
        completedSteps: [],
        capabilities: { movies: true, tv: true },
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        completedAt: completed ? new Date("2026-01-02T00:00:00.000Z") : null,
      }),
    runQuickstart: unused,
    submitAdmin: unused,
    submitCapabilities: unused,
    submitProfiles: unused,
    submitRootFolders: unused,
    submitIndexer: unused,
    submitDownloadClient: unused,
    submitMediaServer: unused,
    skipStep: unused,
    goBack: unused,
    complete: unused,
    startWizard: unused,
  })

const FakeOnboardingLive = onboardingLayer(false)
const CompletedOnboardingLive = onboardingLayer(true)

const completedSetupLayer = ImportServiceLive.pipe(
  Layer.provideMerge(TestDbLive),
  Layer.provideMerge(CompletedOnboardingLive),
)

const TestLayer = ImportServiceLive.pipe(
  Layer.provideMerge(TestDbLive),
  Layer.provideMerge(FakeOnboardingLive),
)

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

function stubSonarrFetch() {
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    if (url.pathname === "/api/v3/series") {
      return jsonResponse([
        {
          id: 10,
          tvdbId: 100,
          title: "Imported Show",
          year: 2026,
          overview: "Imported from Sonarr.",
          monitored: true,
          status: "continuing",
          network: "ARR TV",
          path: "/tv/Imported Show",
          seasonFolder: true,
          seasons: [{ seasonNumber: 1, monitored: true }],
          images: [{ coverType: "poster", remoteUrl: "https://example.test/poster.jpg" }],
        },
      ])
    }
    if (url.pathname === "/api/v3/episode") {
      return jsonResponse([
        {
          id: 501,
          seriesId: 10,
          tvdbId: 1001,
          seasonNumber: 1,
          episodeNumber: 1,
          absoluteEpisodeNumber: 1,
          title: "Pilot",
          airDateUtc: "2026-01-02T01:00:00Z",
          overview: "The first episode.",
          monitored: true,
          hasFile: true,
          episodeFileId: 900,
        },
        {
          id: 502,
          seriesId: 10,
          tvdbId: 1002,
          seasonNumber: 1,
          episodeNumber: 2,
          title: "Missing",
          airDate: "2026-01-09",
          overview: "The missing episode.",
          monitored: false,
          hasFile: false,
          episodeFileId: null,
        },
      ])
    }
    if (url.pathname === "/api/v3/episodefile") {
      return jsonResponse([
        {
          id: 900,
          seriesId: 10,
          seasonNumber: 1,
          relativePath: "Season 01/Pilot.mkv",
          quality: { quality: { name: "HDTV-1080p" } },
        },
      ])
    }

    return new Response(null, { status: 404 })
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("ImportService", () => {
  it("imports Sonarr episodes and linked episode file state", async () => {
    stubSonarrFetch()
    await Effect.runPromise(
      Effect.gen(function* () {
        const imports = yield* ImportService
        const db = yield* Db

        const result = yield* imports.importFromSonarr({
          url: "http://sonarr.test",
          apiKey: "test-key",
        })
        expect(result).toEqual({ imported: 1, skipped: 0 })

        const [importedSeries] = yield* db.select().from(series)
        expect(importedSeries.title).toBe("Imported Show")
        expect(importedSeries.posterPath).toBe("https://example.test/poster.jpg")

        const seasonRows = yield* db
          .select()
          .from(seasons)
          .where(eq(seasons.seriesId, importedSeries.id))
        expect(seasonRows).toHaveLength(1)

        const episodeRows = yield* db
          .select()
          .from(episodes)
          .where(eq(episodes.seasonId, seasonRows[0].id))
        expect(episodeRows).toHaveLength(2)

        const pilot = episodeRows.find((episode) => episode.title === "Pilot")
        expect(pilot?.hasFile).toBe(true)
        expect(pilot?.filePath).toBe("/tv/Imported Show/Season 01/Pilot.mkv")
        expect(pilot?.existingQualityName).toBe("HDTV-1080p")
        expect(pilot?.absoluteEpisodeNumber).toBe(1)

        const missing = episodeRows.find((episode) => episode.title === "Missing")
        expect(missing?.hasFile).toBe(false)
        expect(missing?.monitored).toBe(false)
        expect(missing?.airDate?.toISOString().slice(0, 10)).toBe("2026-01-09")
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  it("rejects connection tests after setup is complete", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal("fetch", fetchSpy)

    await Effect.runPromise(
      Effect.gen(function* () {
        const imports = yield* ImportService

        const radarrError = yield* Effect.flip(
          imports.testRadarr({ url: "http://radarr.test", apiKey: "test-key" }),
        )
        const sonarrError = yield* Effect.flip(
          imports.testSonarr({ url: "http://sonarr.test", apiKey: "test-key" }),
        )

        expect(radarrError._tag).toBe("ImportError")
        expect(sonarrError._tag).toBe("ImportError")
        if (radarrError._tag === "ImportError") {
          expect(radarrError.reason).toBe("setup_not_active")
        }
        if (sonarrError._tag === "ImportError") {
          expect(sonarrError.reason).toBe("setup_not_active")
        }
        expect(fetchSpy).not.toHaveBeenCalled()
      }).pipe(Effect.provide(completedSetupLayer)),
    )
  })
})
