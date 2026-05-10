import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import { TestDbLive } from "#/effect/test/TestDb"

import { PolicyService, PolicyServiceLive } from "./PolicyService"
import { TagService, TagServiceLive } from "./TagService"

const TestLayer = Layer.mergeAll(PolicyServiceLive, TagServiceLive).pipe(
  Layer.provideMerge(TestDbLive),
)

describe("PolicyService", () => {
  it.effect("attaches tags to import lists and reports compatible tag details", () =>
    Effect.gen(function* () {
      const policies = yield* PolicyService
      const tags = yield* TagService

      const list = yield* policies.createImportList({
        name: "Trakt Watchlist",
        type: "trakt",
        enabled: true,
        enableAuto: true,
        tags: ["anime", "anime"],
        settings: { username: "arrhub" },
      })
      const details = yield* tags.detailsList()
      const anime = details.find((tag) => tag.label === "anime")

      expect(list.tags).toEqual(["anime"])
      expect(anime?.importListIds).toEqual([list.id])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("attaches included and excluded tags to release profiles", () =>
    Effect.gen(function* () {
      const policies = yield* PolicyService
      const tags = yield* TagService

      const profile = yield* policies.createReleaseProfile({
        name: "Anime Terms",
        requiredTerms: ["dual audio"],
        ignoredTerms: ["cam"],
        preferredTerms: [{ term: "proper", score: 10 }],
        tags: ["anime"],
        excludedTags: ["kids"],
      })
      const details = yield* tags.detailsList()

      expect(details.find((tag) => tag.label === "anime")?.releaseProfileIds).toEqual([profile.id])
      expect(details.find((tag) => tag.label === "kids")?.excludedReleaseProfileIds).toEqual([
        profile.id,
      ])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("attaches tags to delay profiles and propagates tag renames", () =>
    Effect.gen(function* () {
      const policies = yield* PolicyService
      const tags = yield* TagService

      const profile = yield* policies.createDelayProfile({
        name: "Anime Delay",
        preferredProtocol: "torrent",
        torrentDelayMinutes: 30,
        tags: ["anime"],
      })
      const summaries = yield* tags.list()
      const anime = summaries.find((row) => row.tag.label === "anime")
      if (!anime) throw new Error("expected anime tag")

      yield* tags.update(anime.tag.id, "animation")
      const profiles = yield* policies.listDelayProfiles()
      const details = yield* tags.detailsList()

      expect(profiles.find((row) => row.id === profile.id)?.tags).toEqual(["animation"])
      expect(details.find((tag) => tag.label === "animation")?.delayProfileIds).toEqual([
        profile.id,
      ])
    }).pipe(Effect.provide(TestLayer)),
  )
})
