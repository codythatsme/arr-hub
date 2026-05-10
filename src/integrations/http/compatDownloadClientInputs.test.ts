import { describe, expect, it } from "vitest"

import { ValidationError } from "#/effect/errors"

import {
  downloadClientCreateInputFromBody,
  downloadClientUpdateInputFromBody,
} from "./compatDownloadClientInputs"

describe("compatible download client inputs", () => {
  it("parses Arr-style resources into local create input", () => {
    expect(
      downloadClientCreateInputFromBody({
        name: "SAB",
        implementation: "Sabnzbd",
        enable: true,
        priority: "10",
        removeCompletedDownloads: true,
        fields: [
          { name: "host", value: "sab.local" },
          { name: "port", value: "8085" },
          { name: "username", value: "admin" },
          { name: "password", value: "secret" },
          { name: "useSsl", value: "true" },
          { name: "category", value: "arr-hub" },
        ],
      }),
    ).toEqual({
      name: "SAB",
      type: "sabnzbd",
      host: "sab.local",
      port: 8085,
      username: "admin",
      password: "secret",
      useSsl: true,
      category: "arr-hub",
      enabled: true,
      priority: 10,
      settings: {
        pollIntervalMs: 5000,
        removeCompletedDownloads: true,
      },
    })
  })

  it("parses updates without treating masked passwords as new credentials", () => {
    expect(
      downloadClientUpdateInputFromBody({
        implementation: "qBittorrent",
        fields: [
          { name: "host", value: "qb.local" },
          { name: "password", value: "********" },
          { name: "addPaused", value: true },
        ],
      }),
    ).toEqual({
      type: "qbittorrent",
      host: "qb.local",
      settings: { addPaused: true },
    })
  })

  it("rejects invalid create resources", () => {
    expect(downloadClientCreateInputFromBody({ name: "Missing implementation" })).toBeInstanceOf(
      ValidationError,
    )
    expect(
      downloadClientCreateInputFromBody({
        name: "Bad port",
        implementation: "Transmission",
        host: "transmission.local",
        port: 0,
      }),
    ).toBeInstanceOf(ValidationError)
  })
})
