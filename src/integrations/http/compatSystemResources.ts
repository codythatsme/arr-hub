import { release } from "node:os"
import { dirname } from "node:path"

import type {
  AggregatedHealth,
  HealthStatus,
  SystemStatus,
} from "#/effect/services/DiagnosticsService"

export interface CompatibleSystemStatusResource {
  readonly appName: string
  readonly instanceName: string
  readonly version: string
  readonly buildTime: string
  readonly isDebug: boolean
  readonly isProduction: boolean
  readonly isAdmin: boolean
  readonly isUserInteractive: boolean
  readonly startupPath: string
  readonly appData: string
  readonly osName: string
  readonly osVersion: string
  readonly isNetCore: boolean
  readonly isLinux: boolean
  readonly isOsx: boolean
  readonly isWindows: boolean
  readonly isDocker: boolean
  readonly isContainerized: boolean
  readonly mode: string
  readonly branch: string
  readonly authentication: string
  readonly databaseType: string
  readonly databaseVersion: string
  readonly migrationVersion: number
  readonly urlBase: string
  readonly runtimeVersion: string
  readonly runtimeName: string
  readonly startTime: string
  readonly packageVersion: string
  readonly packageAuthor: string
  readonly packageUpdateMechanism: string
  readonly packageUpdateMechanismMessage: string
}

export interface CompatibleHealthResource {
  readonly id: number
  readonly source: string
  readonly type: "notice" | "warning" | "error"
  readonly message: string
  readonly wikiUrl: string
}

export function systemStatusResource(status: SystemStatus): CompatibleSystemStatusResource {
  const platform = process.platform
  const containerized = isContainerized()

  return {
    appName: "ARR Hub",
    instanceName: process.env.ARR_HUB_INSTANCE_NAME ?? "ARR Hub",
    version: status.version,
    buildTime: process.env.ARR_HUB_BUILD_TIME ?? new Date(0).toISOString(),
    isDebug: process.env.NODE_ENV !== "production",
    isProduction: process.env.NODE_ENV === "production",
    isAdmin: process.getuid?.() === 0,
    isUserInteractive: false,
    startupPath: process.cwd(),
    appData: dirname(status.database.path),
    osName: platform,
    osVersion: release(),
    isNetCore: false,
    isLinux: platform === "linux",
    isOsx: platform === "darwin",
    isWindows: platform === "win32",
    isDocker: containerized,
    isContainerized: containerized,
    mode: "console",
    branch: process.env.ARR_HUB_BRANCH ?? "main",
    authentication: "forms",
    databaseType: "sqlite",
    databaseVersion: "unknown",
    migrationVersion: 0,
    urlBase: process.env.ARR_HUB_URL_BASE ?? "",
    runtimeVersion: process.version,
    runtimeName: "node",
    startTime: new Date(Date.now() - status.uptimeSeconds * 1000).toISOString(),
    packageVersion: status.version,
    packageAuthor: "arr-hub",
    packageUpdateMechanism: "docker",
    packageUpdateMechanismMessage: "Container image updates are managed outside the app.",
  }
}

export function healthResources(health: AggregatedHealth): ReadonlyArray<CompatibleHealthResource> {
  const resources: Array<CompatibleHealthResource> = []
  let id = 1

  for (const failure of health.failures) {
    resources.push({
      id,
      source: failure.type,
      type: "error",
      message: failure.message,
      wikiUrl: "",
    })
    id += 1
  }

  for (const item of health.integrations) {
    if (item.status === "healthy") continue

    resources.push({
      id,
      source: item.type,
      type: healthType(item.status),
      message: item.message ?? `${item.name} is ${item.status}`,
      wikiUrl: "",
    })
    id += 1
  }

  return resources
}

function healthType(status: HealthStatus): CompatibleHealthResource["type"] {
  if (status === "unhealthy") return "error"
  return "warning"
}

function isContainerized(): boolean {
  return process.env.ARR_HUB_CONTAINER === "1" || process.env.container === "docker"
}
