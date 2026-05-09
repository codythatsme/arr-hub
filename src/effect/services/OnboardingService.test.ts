import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { afterEach, vi } from "vitest"

import { TestDbLive } from "#/effect/test/TestDb"

import { AdapterRegistryLive } from "./AdapterRegistry"
import { AuthServiceLive } from "./AuthService"
import { ConfigServiceLive } from "./ConfigService"
import { CryptoServiceLive } from "./CryptoService"
import { DownloadClientServiceLive } from "./DownloadClientService"
import { IndexerService } from "./IndexerService"
import { IndexerServiceLive } from "./IndexerService"
import { MediaServerServiceLive } from "./MediaServerService"
import { OnboardingService, OnboardingServiceLive } from "./OnboardingService"
import { ProfileDefaultsEngineLive } from "./ProfileDefaultsEngine"
import { ProfileServiceLive } from "./ProfileService"

const TestLayer = OnboardingServiceLive.pipe(
  Layer.provideMerge(AuthServiceLive),
  Layer.provideMerge(IndexerServiceLive),
  Layer.provideMerge(DownloadClientServiceLive),
  Layer.provideMerge(MediaServerServiceLive),
  Layer.provideMerge(ProfileDefaultsEngineLive),
  Layer.provideMerge(ProfileServiceLive),
  Layer.provideMerge(AdapterRegistryLive),
  Layer.provideMerge(ConfigServiceLive),
  Layer.provideMerge(CryptoServiceLive),
  Layer.provideMerge(TestDbLive),
)

afterEach(() => {
  vi.restoreAllMocks()
})

describe("OnboardingService", () => {
  it.effect("quickstart creates admin, defaults, root folders, and completed setup state", () =>
    Effect.gen(function* () {
      const service = yield* OnboardingService
      const result = yield* service.runQuickstart({
        username: "admin",
        password: "password123",
        moviesRootFolder: "/media/movies/",
        tvRootFolder: "/media/tv",
      })
      const status = yield* service.getStatus()

      expect(result.session.token.length).toBeGreaterThan(0)
      expect(status.completed).toBe(true)
      expect(status.path).toBe("quickstart")
      expect(status.hasAdmin).toBe(true)
      expect(status.completedSteps).toContain("review")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("quickstart validates and stores optional core integrations", () =>
    Effect.gen(function* () {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          `
            <caps>
              <searching><search available="yes" /></searching>
              <categories><category id="2000" name="Movies" /></categories>
            </caps>
          `,
          { headers: { "content-type": "application/xml" } },
        ),
      )
      const service = yield* OnboardingService
      const indexers = yield* IndexerService

      yield* service.runQuickstart({
        username: "admin",
        password: "password123",
        indexer: {
          name: "Fixture Torznab",
          type: "torznab",
          baseUrl: "http://torznab.local",
          apiKey: "api-key",
        },
      })

      const stored = yield* indexers.list()
      expect(stored).toHaveLength(1)
      expect(stored[0].name).toBe("Fixture Torznab")
      expect(stored[0].type).toBe("torznab")
      expect(stored[0].baseUrl).toBe("http://torznab.local")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("quickstart rejects invalid optional integrations before creating admin", () =>
    Effect.gen(function* () {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connection refused"))
      const service = yield* OnboardingService
      const error = yield* Effect.flip(
        service.runQuickstart({
          username: "admin",
          password: "password123",
          indexer: {
            name: "Broken",
            type: "torznab",
            baseUrl: "http://torznab.local",
            apiKey: "api-key",
          },
        }),
      )
      const status = yield* service.getStatus()

      expect(error._tag).toBe("IndexerError")
      expect(status.hasAdmin).toBe(false)
      expect(status.completed).toBe(false)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("wizard advances, skips integration steps, supports back, and completes", () =>
    Effect.gen(function* () {
      const service = yield* OnboardingService
      yield* service.startWizard()
      yield* service.submitAdmin({ username: "admin", password: "password123" })
      yield* service.submitCapabilities({ movies: true, tv: false })
      yield* service.submitProfiles({ bundleId: "trash-hd" })
      yield* service.submitRootFolders({ movies: "/media/movies" })
      yield* service.skipStep("indexers")
      yield* service.goBack()

      const backedUp = yield* service.getStatus()
      expect(backedUp.currentStep).toBe("indexers")
      expect(backedUp.completedSteps).not.toContain("indexers")

      yield* service.skipStep("indexers")
      yield* service.skipStep("download_client")
      yield* service.skipStep("media_server")
      yield* service.skipStep("import")
      yield* service.complete()

      const complete = yield* service.getStatus()
      expect(complete.completed).toBe(true)
      expect(complete.capabilities).toEqual({ movies: true, tv: false })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("rejects completing before setup has started", () =>
    Effect.gen(function* () {
      const service = yield* OnboardingService
      const error = yield* Effect.flip(service.complete())

      expect(error._tag).toBe("OnboardingError")
      if (error._tag === "OnboardingError") expect(error.reason).toBe("not_started")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("rejects wizard steps submitted out of order", () =>
    Effect.gen(function* () {
      const service = yield* OnboardingService
      yield* service.startWizard()
      const error = yield* Effect.flip(service.submitProfiles({ bundleId: "trash-hd" }))

      expect(error._tag).toBe("OnboardingError")
      if (error._tag === "OnboardingError") expect(error.reason).toBe("step_out_of_order")
    }).pipe(Effect.provide(TestLayer)),
  )
})
