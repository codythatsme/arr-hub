import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"

import { episodes, movies, qualityProfiles, seasons, series } from "#/db/schema"
import { Db } from "#/effect/services/Db"
import { TestDbLive } from "#/effect/test/TestDb"

import { episodeCutoffSearchCandidates, movieCutoffSearchCandidates } from "./SchedulerLoop"

describe("SchedulerLoop cutoff candidates", () => {
  it.effect("selects only movies below their profile cutoff", () =>
    Effect.gen(function* () {
      const db = yield* Db
      const profiles = yield* db
        .insert(qualityProfiles)
        .values([
          {
            name: "cutoff-enabled",
            upgradeAllowed: true,
            cutoffFormatScore: 10,
          },
          {
            name: "no-cutoff",
            upgradeAllowed: true,
            cutoffFormatScore: 0,
          },
          {
            name: "upgrades-disabled",
            upgradeAllowed: false,
            cutoffFormatScore: 10,
          },
        ])
        .returning({ id: qualityProfiles.id, name: qualityProfiles.name })
      const profileId = (name: string) => profiles.find((profile) => profile.name === name)!.id

      const belowRows = yield* db
        .insert(movies)
        .values({
          tmdbId: 10_001,
          title: "Below Cutoff",
          status: "available",
          monitored: true,
          hasFile: true,
          qualityProfileId: profileId("cutoff-enabled"),
          existingFormatScore: 3,
        })
        .returning({ id: movies.id })
      const unknownRows = yield* db
        .insert(movies)
        .values({
          tmdbId: 10_002,
          title: "Unknown Score",
          status: "available",
          monitored: true,
          hasFile: true,
          qualityProfileId: profileId("cutoff-enabled"),
          existingFormatScore: null,
        })
        .returning({ id: movies.id })

      yield* db.insert(movies).values([
        {
          tmdbId: 10_003,
          title: "At Cutoff",
          status: "available",
          monitored: true,
          hasFile: true,
          qualityProfileId: profileId("cutoff-enabled"),
          existingFormatScore: 10,
        },
        {
          tmdbId: 10_004,
          title: "No Cutoff",
          status: "available",
          monitored: true,
          hasFile: true,
          qualityProfileId: profileId("no-cutoff"),
          existingFormatScore: 0,
        },
        {
          tmdbId: 10_005,
          title: "Disabled Upgrades",
          status: "available",
          monitored: true,
          hasFile: true,
          qualityProfileId: profileId("upgrades-disabled"),
          existingFormatScore: 1,
        },
        {
          tmdbId: 10_006,
          title: "Missing File",
          status: "available",
          monitored: true,
          hasFile: false,
          qualityProfileId: profileId("cutoff-enabled"),
          existingFormatScore: 1,
        },
        {
          tmdbId: 10_007,
          title: "Unmonitored",
          status: "available",
          monitored: false,
          hasFile: true,
          qualityProfileId: profileId("cutoff-enabled"),
          existingFormatScore: 1,
        },
      ])

      const candidates = yield* movieCutoffSearchCandidates
      expect(candidates.map((row) => row.id).toSorted()).toEqual(
        [belowRows[0].id, unknownRows[0].id].toSorted(),
      )
    }).pipe(Effect.provide(TestDbLive)),
  )

  it.effect("selects only episodes below their series profile cutoff", () =>
    Effect.gen(function* () {
      const db = yield* Db
      const profiles = yield* db
        .insert(qualityProfiles)
        .values([
          {
            name: "tv-cutoff-enabled",
            upgradeAllowed: true,
            cutoffFormatScore: 10,
          },
          {
            name: "tv-no-cutoff",
            upgradeAllowed: true,
            cutoffFormatScore: 0,
          },
          {
            name: "tv-upgrades-disabled",
            upgradeAllowed: false,
            cutoffFormatScore: 10,
          },
        ])
        .returning({ id: qualityProfiles.id, name: qualityProfiles.name })
      const profileId = (name: string) => profiles.find((profile) => profile.name === name)!.id

      const addEpisode = (input: {
        readonly tvdbBase: number
        readonly title: string
        readonly profileId: number
        readonly existingFormatScore: number | null
        readonly seriesMonitored?: boolean
        readonly seasonMonitored?: boolean
        readonly episodeMonitored?: boolean
      }) =>
        Effect.gen(function* () {
          const seriesRows = yield* db
            .insert(series)
            .values({
              tvdbId: input.tvdbBase,
              title: input.title,
              monitored: input.seriesMonitored ?? true,
              qualityProfileId: input.profileId,
            })
            .returning({ id: series.id })
          const seasonRows = yield* db
            .insert(seasons)
            .values({
              seriesId: seriesRows[0].id,
              seasonNumber: 1,
              monitored: input.seasonMonitored ?? true,
            })
            .returning({ id: seasons.id })
          const episodeRows = yield* db
            .insert(episodes)
            .values({
              seasonId: seasonRows[0].id,
              tvdbId: input.tvdbBase + 1,
              title: input.title,
              episodeNumber: 1,
              hasFile: true,
              monitored: input.episodeMonitored ?? true,
              existingFormatScore: input.existingFormatScore,
            })
            .returning({ id: episodes.id })
          return episodeRows[0].id
        })

      const belowId = yield* addEpisode({
        tvdbBase: 20_001,
        title: "Below Cutoff",
        profileId: profileId("tv-cutoff-enabled"),
        existingFormatScore: 3,
      })
      const unknownId = yield* addEpisode({
        tvdbBase: 20_011,
        title: "Unknown Score",
        profileId: profileId("tv-cutoff-enabled"),
        existingFormatScore: null,
      })

      yield* addEpisode({
        tvdbBase: 20_021,
        title: "At Cutoff",
        profileId: profileId("tv-cutoff-enabled"),
        existingFormatScore: 10,
      })
      yield* addEpisode({
        tvdbBase: 20_031,
        title: "No Cutoff",
        profileId: profileId("tv-no-cutoff"),
        existingFormatScore: 0,
      })
      yield* addEpisode({
        tvdbBase: 20_041,
        title: "Disabled Upgrades",
        profileId: profileId("tv-upgrades-disabled"),
        existingFormatScore: 1,
      })
      yield* addEpisode({
        tvdbBase: 20_051,
        title: "Unmonitored Series",
        profileId: profileId("tv-cutoff-enabled"),
        existingFormatScore: 1,
        seriesMonitored: false,
      })
      yield* addEpisode({
        tvdbBase: 20_061,
        title: "Unmonitored Season",
        profileId: profileId("tv-cutoff-enabled"),
        existingFormatScore: 1,
        seasonMonitored: false,
      })
      yield* addEpisode({
        tvdbBase: 20_071,
        title: "Unmonitored Episode",
        profileId: profileId("tv-cutoff-enabled"),
        existingFormatScore: 1,
        episodeMonitored: false,
      })

      const candidates = yield* episodeCutoffSearchCandidates
      expect(candidates.map((row) => row.id).toSorted()).toEqual([belowId, unknownId].toSorted())
    }).pipe(Effect.provide(TestDbLive)),
  )
})
