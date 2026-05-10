import type {
  DownloadClientSettings,
  DownloadClientWithHealth,
  DownloadProtocol,
} from "#/effect/domain/downloadClient"

export interface CompatibleDownloadClientFieldResource {
  readonly order: number
  readonly name: string
  readonly label: string
  readonly unit: string | null
  readonly helpText: string | null
  readonly helpTextWarning: string | null
  readonly helpLink: string | null
  readonly value: unknown
  readonly type: string
  readonly advanced: boolean
  readonly selectOptions: null
  readonly selectOptionsProviderAction: null
  readonly section: string | null
  readonly hidden: boolean | null
  readonly privacy: "normal" | "password"
  readonly placeholder: string | null
  readonly isFloat: boolean
}

export interface CompatibleDownloadClientResource {
  readonly id: number
  readonly name: string
  readonly implementationName: string
  readonly implementation: string
  readonly configContract: string
  readonly infoLink: string
  readonly message: null
  readonly tags: ReadonlyArray<number>
  readonly fields: ReadonlyArray<CompatibleDownloadClientFieldResource>
  readonly presets: null
  readonly enable: boolean
  readonly protocol: DownloadProtocol
  readonly priority: number
  readonly removeCompletedDownloads: boolean
  readonly removeFailedDownloads: boolean
  readonly categories: ReadonlyArray<{
    readonly clientCategory: string
    readonly categories: ReadonlyArray<number>
  }>
  readonly supportsCategories: boolean
}

export function downloadClientResource(
  client: DownloadClientWithHealth,
): CompatibleDownloadClientResource {
  const implementation = implementationForType(client.type)
  const protocol = protocolForType(client.type)

  return {
    id: client.id,
    name: client.name,
    implementationName: implementation,
    implementation,
    configContract: `${implementation}Settings`,
    infoLink: infoLink(implementation),
    message: null,
    tags: [],
    fields: fieldsForClient(client),
    presets: null,
    enable: client.enabled,
    protocol,
    priority: client.priority,
    removeCompletedDownloads: client.settings.removeCompletedDownloads ?? false,
    removeFailedDownloads: client.settings.removeFailedDownloads ?? false,
    categories: client.category ? [{ clientCategory: client.category, categories: [] }] : [],
    supportsCategories: true,
  }
}

function fieldsForClient(
  client: DownloadClientWithHealth,
): ReadonlyArray<CompatibleDownloadClientFieldResource> {
  return [
    field(0, "host", "Host", client.host, "textbox"),
    field(1, "port", "Port", client.port, "number"),
    field(2, "username", "Username", client.username, "textbox"),
    field(3, "password", "Password", "********", "password", "password"),
    field(4, "useSsl", "Use SSL", client.useSsl, "checkbox"),
    field(5, "category", "Category", client.category, "textbox"),
    field(
      6,
      "addPaused",
      "Add Paused",
      client.settings.addPaused ?? false,
      "checkbox",
      "normal",
      true,
    ),
    field(
      7,
      "removeCompletedDownloads",
      "Remove Completed",
      client.settings.removeCompletedDownloads ?? false,
      "checkbox",
      "normal",
      true,
    ),
    field(
      8,
      "removeFailedDownloads",
      "Remove Failed",
      client.settings.removeFailedDownloads ?? false,
      "checkbox",
      "normal",
      true,
    ),
    field(
      9,
      "blackholeFolder",
      "Blackhole Folder",
      client.settings.blackholeFolder ?? null,
      "textbox",
      "normal",
      true,
    ),
    field(
      10,
      "watchFolder",
      "Watch Folder",
      client.settings.watchFolder ?? null,
      "textbox",
      "normal",
      true,
    ),
  ]
}

function field(
  order: number,
  name: string,
  label: string,
  value: unknown,
  type: string,
  privacy: "normal" | "password" = "normal",
  advanced = false,
): CompatibleDownloadClientFieldResource {
  return {
    order,
    name,
    label,
    unit: null,
    helpText: null,
    helpTextWarning: null,
    helpLink: null,
    value,
    type,
    advanced,
    selectOptions: null,
    selectOptionsProviderAction: null,
    section: null,
    hidden: null,
    privacy,
    placeholder: null,
    isFloat: false,
  }
}

export function implementationForType(type: string): string {
  switch (type) {
    case "deluge":
      return "Deluge"
    case "nzbget":
      return "Nzbget"
    case "qbittorrent":
      return "QBittorrent"
    case "sabnzbd":
      return "Sabnzbd"
    case "transmission":
      return "Transmission"
    case "usenet_blackhole":
      return "UsenetBlackhole"
    case "torrent_blackhole":
      return "TorrentBlackhole"
    default:
      return type
  }
}

export function protocolForType(type: string): DownloadProtocol {
  if (type === "sabnzbd" || type === "nzbget" || type === "usenet_blackhole") return "usenet"
  return "torrent"
}

export function defaultPortForType(type: string): number {
  switch (type) {
    case "deluge":
      return 8112
    case "nzbget":
      return 6789
    case "transmission":
      return 9091
    case "torrent_blackhole":
    case "usenet_blackhole":
      return 1
    default:
      return 8080
  }
}

export function defaultDownloadClientSettings(): DownloadClientSettings {
  return { pollIntervalMs: 5000 }
}

function infoLink(implementation: string): string {
  return `https://wiki.servarr.com/sonarr/supported#${implementation.toLowerCase()}`
}
