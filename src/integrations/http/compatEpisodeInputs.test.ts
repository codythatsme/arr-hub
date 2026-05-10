import { describe, expect, it } from "vitest"

import { ValidationError } from "#/effect/errors"

import { episodeMonitorInputFromBody } from "./compatEpisodeInputs"

describe("compatible episode inputs", () => {
  it("parses Sonarr-style monitor update bodies", () => {
    expect(episodeMonitorInputFromBody({ monitored: false })).toEqual({ monitored: false })
    expect(episodeMonitorInputFromBody({ monitored: true })).toEqual({ monitored: true })
  })

  it("rejects invalid monitor update bodies", () => {
    expect(episodeMonitorInputFromBody(null)).toBeInstanceOf(ValidationError)
    expect(episodeMonitorInputFromBody({ monitored: "false" })).toBeInstanceOf(ValidationError)
    expect(episodeMonitorInputFromBody({})).toBeInstanceOf(ValidationError)
  })
})
