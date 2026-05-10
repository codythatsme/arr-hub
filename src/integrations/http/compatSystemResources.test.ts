import { describe, expect, it } from "vitest"

import type { AggregatedHealth, SystemStatus } from "#/effect/services/DiagnosticsService"

import { healthResources, systemStatusResource } from "./compatSystemResources"

describe("compatible system resources", () => {
  it("maps diagnostics status to an Arr-style system status resource", () => {
    const status: SystemStatus = {
      version: "1.2.3",
      uptimeSeconds: 60,
      database: {
        path: "data/arr-hub.db",
        sizeBytes: 100,
        tableCounts: {
          movies: 1,
          series: 2,
          indexers: 3,
          downloadClients: 4,
          mediaServers: 5,
          queueItems: 6,
          settings: 7,
          apiKeys: 8,
        },
      },
      resources: {
        rssBytes: 1,
        heapUsedBytes: 2,
        heapTotalBytes: 3,
        externalBytes: 4,
        userCpuMicros: 5,
        systemCpuMicros: 6,
      },
    }

    const resource = systemStatusResource(status)

    expect(resource.appName).toBe("ARR Hub")
    expect(resource.version).toBe("1.2.3")
    expect(resource.appData).toBe("data")
    expect(resource.databaseType).toBe("sqlite")
    expect(resource.runtimeName).toBe("node")
  })

  it("maps diagnostics failures and degraded integrations to Arr-style health resources", () => {
    const health: AggregatedHealth = {
      status: "unhealthy",
      failures: [{ type: "clock", message: "Clock moved backwards." }],
      integrations: [
        {
          type: "indexer",
          id: 10,
          name: "Indexer",
          enabled: true,
          status: "healthy",
          lastCheck: null,
          message: null,
        },
        {
          type: "download_client",
          id: 20,
          name: "Client",
          enabled: true,
          status: "degraded",
          lastCheck: null,
          message: "Client has no recent health check.",
        },
      ],
    }

    expect(healthResources(health)).toEqual([
      {
        id: 1,
        source: "clock",
        type: "error",
        message: "Clock moved backwards.",
        wikiUrl: "",
      },
      {
        id: 2,
        source: "download_client",
        type: "warning",
        message: "Client has no recent health check.",
        wikiUrl: "",
      },
    ])
  })
})
