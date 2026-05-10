import type {
  IndexerCapabilities,
  IndexerProtocol,
  IndexerWithHealth,
} from "#/effect/domain/indexer"

export interface CompatibleIndexerFieldResource {
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

export interface CompatibleIndexerResource {
  readonly id: number
  readonly name: string
  readonly implementationName: string
  readonly implementation: string
  readonly configContract: string
  readonly infoLink: string
  readonly message: null
  readonly tags: ReadonlyArray<number>
  readonly fields: ReadonlyArray<CompatibleIndexerFieldResource>
  readonly presets: null
  readonly enable: boolean
  readonly enableRss: boolean
  readonly enableAutomaticSearch: boolean
  readonly enableInteractiveSearch: boolean
  readonly supportsRss: boolean
  readonly supportsSearch: boolean
  readonly protocol: IndexerProtocol
  readonly priority: number
  readonly downloadClientId: number
  readonly seasonSearchMaximumSingleEpisodeAge: number
  readonly redirect: boolean
  readonly supportsRedirect: boolean
  readonly supportsPagination: boolean
  readonly appProfileId: number
  readonly privacy: "public" | "private" | "semi_private"
  readonly capabilities: CompatibleIndexerCapabilitiesResource
  readonly added: Date
  readonly status: CompatibleIndexerStatusResource | null
  readonly definitionName: string
  readonly indexerUrls: ReadonlyArray<string>
  readonly legacyUrls: ReadonlyArray<string>
  readonly description: string
  readonly language: string
  readonly encoding: string
  readonly sortName: string
}

interface CompatibleIndexerCapabilitiesResource {
  readonly limitsMax: number | null
  readonly limitsDefault: number | null
  readonly categories: ReadonlyArray<{
    readonly id: number
    readonly name: string
    readonly subCategories: ReadonlyArray<never>
  }>
  readonly supportsRawSearch: boolean
  readonly searchParams: ReadonlyArray<string>
  readonly tvSearchParams: ReadonlyArray<string>
  readonly movieSearchParams: ReadonlyArray<string>
  readonly musicSearchParams: ReadonlyArray<string>
  readonly bookSearchParams: ReadonlyArray<string>
}

interface CompatibleIndexerStatusResource {
  readonly indexerId: number
  readonly disabledTill: Date | null
  readonly mostRecentFailure: Date | null
  readonly initialFailure: Date | null
}

export function indexerResource(indexer: IndexerWithHealth): CompatibleIndexerResource {
  const protocol = protocolForIndexer(indexer)
  const implementation = implementationForType(indexer.type)
  const capabilities = indexer.capabilities ?? defaultCapabilities(protocol)
  const supportsSearch = indexer.capabilities
    ? indexer.capabilities.searchTypes.length > 0
    : indexer.searchEnabled

  return {
    id: indexer.id,
    name: indexer.name,
    implementationName: implementation,
    implementation,
    configContract: `${implementation}Settings`,
    infoLink: infoLink(implementation),
    message: null,
    tags: [],
    fields: indexerFields(indexer),
    presets: null,
    enable: indexer.enabled,
    enableRss: indexer.rssEnabled,
    enableAutomaticSearch: indexer.searchEnabled,
    enableInteractiveSearch: indexer.searchEnabled,
    supportsRss: true,
    supportsSearch,
    protocol,
    priority: indexer.priority,
    downloadClientId: 0,
    seasonSearchMaximumSingleEpisodeAge: 0,
    redirect: protocol === "usenet",
    supportsRedirect: protocol === "usenet",
    supportsPagination: true,
    appProfileId: 1,
    privacy: "private",
    capabilities: capabilityResource(capabilities),
    added: indexer.createdAt,
    status: statusResource(indexer),
    definitionName: indexer.definitionKey ?? implementation,
    indexerUrls: [indexer.baseUrl],
    legacyUrls: [],
    description: `${implementation} indexer`,
    language: "en-US",
    encoding: "UTF-8",
    sortName: indexer.name.toLowerCase(),
  }
}

function indexerFields(indexer: IndexerWithHealth): ReadonlyArray<CompatibleIndexerFieldResource> {
  return [
    field(0, "baseUrl", "URL", indexer.baseUrl, "textbox"),
    field(1, "apiKey", "API Key", "********", "password", "password"),
    field(2, "categories", "Categories", indexer.categories, "textbox", "normal", true),
    field(3, "minimumSeeders", "Minimum Seeders", indexer.minimumSeeders, "number", "normal", true),
    field(4, "definitionKey", "Definition Key", indexer.definitionKey, "textbox", "normal", true),
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
): CompatibleIndexerFieldResource {
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

function capabilityResource(
  capabilities: IndexerCapabilities,
): CompatibleIndexerCapabilitiesResource {
  return {
    limitsMax: null,
    limitsDefault: null,
    categories: capabilities.categories.map((category) => ({
      id: category.id,
      name: category.name,
      subCategories: [],
    })),
    supportsRawSearch: capabilities.searchTypes.includes("search"),
    searchParams: capabilities.searchTypes.includes("search") ? ["q"] : [],
    tvSearchParams: capabilities.searchTypes.includes("tvsearch")
      ? ["q", "season", "ep", "tvdbid"]
      : [],
    movieSearchParams: capabilities.searchTypes.includes("movie") ? ["q", "imdbid", "tmdbid"] : [],
    musicSearchParams: [],
    bookSearchParams: [],
  }
}

function statusResource(indexer: IndexerWithHealth): CompatibleIndexerStatusResource | null {
  if (!indexer.health || indexer.health.status !== "unhealthy") return null
  return {
    indexerId: indexer.id,
    disabledTill: null,
    mostRecentFailure: indexer.health.lastCheck,
    initialFailure: indexer.health.lastCheck,
  }
}

function defaultCapabilities(protocol: IndexerProtocol): IndexerCapabilities {
  return {
    searchTypes: ["search", "movie", "tvsearch"],
    categories:
      protocol === "usenet"
        ? [
            { id: 2000, name: "Movies" },
            { id: 5000, name: "TV" },
          ]
        : [
            { id: 2000, name: "Movies" },
            { id: 5000, name: "TV" },
          ],
  }
}

function implementationForType(type: string): string {
  if (type === "newznab") return "Newznab"
  if (type === "cardigann_yaml") return "Cardigann"
  return "Torznab"
}

function protocolForIndexer(indexer: IndexerWithHealth): IndexerProtocol {
  if (indexer.type === "newznab") return "usenet"
  return "torrent"
}

function infoLink(implementation: string): string {
  return `https://wiki.servarr.com/prowlarr/supported-indexers#${implementation.toLowerCase()}`
}
