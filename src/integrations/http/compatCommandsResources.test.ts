import { describe, expect, it } from "vitest"

import { ValidationError } from "#/effect/errors"

import { commandPayloadSpecsFromBody } from "./compatCommandPayloads"
import {
  commandResource,
  commandResult,
  commandStatus,
  type SchedulerJobRow,
} from "./compatCommandsResources"

const baseJob: SchedulerJobRow = {
  id: 1,
  jobType: "tv_search_episode",
  status: "running",
  dedupeKey: "tv_search_episode:42",
  payload: { _tag: "tv_search_episode", episodeId: 42 },
  attempts: 1,
  maxAttempts: 4,
  nextRunAt: new Date("2026-01-01T00:00:00.000Z"),
  startedAt: new Date("2026-01-01T00:00:05.000Z"),
  completedAt: null,
  errorMessage: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
}

describe("compatible command resources", () => {
  it("maps local scheduler jobs to Arr-style command resources", () => {
    expect(commandResource(baseJob)).toMatchObject({
      id: 1,
      name: "EpisodeSearch",
      commandName: "Episode Search",
      message: "Running",
      status: "started",
      result: "unknown",
      queued: "2026-01-01T00:00:00.000Z",
      started: "2026-01-01T00:00:05.000Z",
      ended: null,
      duration: null,
      exception: null,
      trigger: "manual",
      body: {
        name: "EpisodeSearch",
        episodeId: 42,
        episodeIds: [42],
        sendUpdatesToClient: true,
      },
    })
  })

  it("maps terminal statuses and durations", () => {
    const completed = commandResource({
      ...baseJob,
      status: "completed",
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      completedAt: new Date("2026-01-01T01:02:03.000Z"),
    })

    expect(completed.status).toBe("completed")
    expect(completed.result).toBe("successful")
    expect(completed.duration).toBe("1:02:03")
    expect(commandStatus("dead")).toBe("failed")
    expect(commandResult("dead")).toBe("unsuccessful")
  })

  it("translates common command bodies into scheduler payloads", () => {
    expect(commandPayloadSpecsFromBody({ name: "MoviesSearch", movieIds: [10, "11"] })).toEqual([
      { _tag: "search_missing", movieId: 10 },
      { _tag: "search_missing", movieId: 11 },
    ])

    expect(
      commandPayloadSpecsFromBody({ name: "SeasonSearch", seriesId: 5, seasonNumber: 2 }),
    ).toEqual([{ _tag: "tv_search_season_by_number", seriesId: 5, seasonNumber: 2 }])

    expect(commandPayloadSpecsFromBody({ name: "ApplicationIndexerSync" })).toEqual([
      { _tag: "indexer_application_sync" },
    ])
  })

  it("rejects unsupported or incomplete command bodies", () => {
    expect(commandPayloadSpecsFromBody({ name: "MissingMoviesSearch" })).toBeInstanceOf(
      ValidationError,
    )
    expect(commandPayloadSpecsFromBody({ name: "ResetApiKey" })).toBeInstanceOf(ValidationError)
  })
})
