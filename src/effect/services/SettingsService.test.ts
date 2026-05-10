import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import { TestDbLive } from "#/effect/test/TestDb"

import { SettingsService, SettingsServiceLive } from "./SettingsService"

const TestLayer = SettingsServiceLive.pipe(Layer.provideMerge(TestDbLive))

describe("SettingsService", () => {
  it.effect("lists default settings grouped by workflow domain", () =>
    Effect.gen(function* () {
      const service = yield* SettingsService
      const entries = yield* service.list()

      expect(entries.map((entry) => entry.group)).toContain("General")
      expect(entries.map((entry) => entry.group)).toContain("Media Management")
      expect(entries.map((entry) => entry.group)).toContain("Release Decisions")
      expect(entries.map((entry) => entry.group)).toContain("Scheduler")
      expect(entries.find((entry) => entry.key === "app.name")?.value).toBe("ARR Hub")
      expect(
        entries.find((entry) => entry.key === "media.importStabilityDelaySeconds")?.value,
      ).toBe("60")
      expect(entries.find((entry) => entry.key === "release.minimumSeeders")?.value).toBe("1")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("sets and reads a validated setting", () =>
    Effect.gen(function* () {
      const service = yield* SettingsService
      const updated = yield* service.set("app.name", "Media Ops")
      const loaded = yield* service.get("app.name")

      expect(updated.value).toBe("Media Ops")
      expect(loaded.value).toBe("Media Ops")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("rejects unknown keys and invalid values", () =>
    Effect.gen(function* () {
      const service = yield* SettingsService
      const unknown = yield* Effect.flip(service.get("unknown.key"))
      const invalid = yield* Effect.flip(service.set("app.updateChannel", "nightly"))
      const badProtocol = yield* Effect.flip(service.set("release.allowedProtocols", "ed2k"))
      const badAge = yield* Effect.flip(service.set("release.minimumAgeHours", "-1"))
      const badImportDelay = yield* Effect.flip(
        service.set("media.importStabilityDelaySeconds", "-1"),
      )

      expect(unknown._tag).toBe("SettingsError")
      if (unknown._tag === "SettingsError") expect(unknown.reason).toBe("invalid_key")
      expect(invalid._tag).toBe("SettingsError")
      if (invalid._tag === "SettingsError") expect(invalid.reason).toBe("invalid_value")
      expect(badProtocol._tag).toBe("SettingsError")
      if (badProtocol._tag === "SettingsError") expect(badProtocol.reason).toBe("invalid_value")
      expect(badAge._tag).toBe("SettingsError")
      if (badAge._tag === "SettingsError") expect(badAge.reason).toBe("invalid_value")
      expect(badImportDelay._tag).toBe("SettingsError")
      if (badImportDelay._tag === "SettingsError") {
        expect(badImportDelay.reason).toBe("invalid_value")
      }
    }).pipe(Effect.provide(TestLayer)),
  )
})
