type HttpMethod = "delete" | "get" | "post" | "put"

interface OpenApiParameter {
  readonly name: string
  readonly in: "path" | "query"
  readonly required?: boolean
  readonly description?: string
  readonly schema: Record<string, unknown>
  readonly style?: "form"
  readonly explode?: boolean
}

interface OpenApiOperation {
  readonly tags: ReadonlyArray<string>
  readonly summary: string
  readonly description?: string
  readonly operationId: string
  readonly parameters?: ReadonlyArray<OpenApiParameter | { readonly $ref: string }>
  readonly requestBody?: {
    readonly required: boolean
    readonly content: Record<string, { readonly schema: Record<string, unknown> }>
  }
  readonly responses: Record<
    string,
    {
      readonly description: string
      readonly content?: Record<string, { readonly schema: Record<string, unknown> }>
    }
  >
  readonly security?: ReadonlyArray<Record<string, ReadonlyArray<string>>>
}

type OpenApiPathItem = Partial<Record<HttpMethod, OpenApiOperation>>

const JSON_MEDIA_TYPE = "application/json"
const XML_MEDIA_TYPE = "application/rss+xml"

const authenticatedSecurity = [{ BearerAuth: [] }, { "X-Api-Key": [] }, { apikey: [] }] as const
const queryApiKeySecurity = [{ apikey: [] }] as const

const versionParameter = { $ref: "#/components/parameters/Version" } as const
const idParameter = { $ref: "#/components/parameters/Id" } as const
const backupIdParameter = { $ref: "#/components/parameters/BackupId" } as const

const pageQuery = queryParameter("page", "1-based page number.", { type: "integer", minimum: 1 })
const pageSizeQuery = queryParameter("pageSize", "Number of records per page.", {
  type: "integer",
  minimum: 1,
})
const sortKeyQuery = queryParameter("sortKey", "Field name used for sorting.", { type: "string" })
const sortDirectionQuery = queryParameter("sortDirection", "Sort direction.", {
  type: "string",
  enum: ["ascending", "descending"],
})

export const publicOpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "ARR Hub Public API",
    version: "0.1.0",
    description:
      "First-pass ARR Hub REST API documentation. Compatible endpoints mirror common Radarr, Sonarr, and Prowlarr route shapes where implemented.",
  },
  servers: [
    {
      url: "{protocol}://{hostpath}",
      variables: {
        protocol: { default: "http", enum: ["http", "https"] },
        hostpath: { default: "localhost:3000" },
      },
    },
  ],
  tags: [
    { name: "Docs" },
    { name: "Movies" },
    { name: "Series" },
    { name: "Episodes" },
    { name: "Indexers" },
    { name: "Download Clients" },
    { name: "Queue" },
    { name: "History" },
    { name: "Wanted" },
    { name: "Calendar" },
    { name: "Commands" },
    { name: "Tags" },
    { name: "Profiles" },
    { name: "Root Folders" },
    { name: "System" },
    { name: "Native" },
  ],
  security: authenticatedSecurity,
  paths: {
    "/api/openapi": {
      get: publicOperation("Docs", "Get the public OpenAPI document", "getPublicOpenApi"),
    },
    "/api/{version}/openapi": {
      get: publicOperation(
        "Docs",
        "Get the compatible-version OpenAPI document",
        "getVersionedOpenApi",
        [versionParameter],
      ),
    },
    "/api/{version}/movie": {
      get: operation("Movies", "List movies", "listMovies", {
        parameters: [
          versionParameter,
          queryParameter("status", "Filter by local movie status.", {
            type: "string",
            enum: ["wanted", "available", "missing"],
          }),
          booleanQuery("monitored", "Filter by monitored state."),
          queryParameter("tmdbId", "Filter by TMDB id.", { type: "integer", minimum: 1 }),
        ],
        responseSchema: arraySchema("MovieResource"),
      }),
      post: operation("Movies", "Create a movie", "createMovie", {
        requestSchema: schemaRef("MovieResource"),
        responseCode: "201",
        responseSchema: schemaRef("MovieResource"),
      }),
    },
    "/api/{version}/movie/{id}": {
      get: operation("Movies", "Get a movie", "getMovie", {
        parameters: [versionParameter, idParameter],
        responseSchema: schemaRef("MovieResource"),
      }),
      put: operation("Movies", "Update a movie", "updateMovie", {
        parameters: [versionParameter, idParameter],
        requestSchema: schemaRef("MovieResource"),
        responseCode: "202",
        responseSchema: schemaRef("MovieResource"),
      }),
      delete: noContentOperation("Movies", "Delete a movie", "deleteMovie", [
        versionParameter,
        idParameter,
      ]),
    },
    "/api/{version}/series": {
      get: operation("Series", "List series", "listSeries", {
        parameters: [
          versionParameter,
          queryParameter("status", "Filter by local series status.", {
            type: "string",
            enum: ["continuing", "ended", "wanted", "available"],
          }),
          booleanQuery("monitored", "Filter by monitored state."),
          queryParameter("tvdbId", "Filter by TVDB id.", { type: "integer", minimum: 1 }),
        ],
        responseSchema: arraySchema("SeriesResource"),
      }),
      post: operation("Series", "Create a series", "createSeries", {
        requestSchema: schemaRef("SeriesResource"),
        responseCode: "201",
        responseSchema: schemaRef("SeriesResource"),
      }),
    },
    "/api/{version}/series/{id}": {
      get: operation("Series", "Get a series", "getSeries", {
        parameters: [versionParameter, idParameter],
        responseSchema: schemaRef("SeriesResource"),
      }),
      put: operation("Series", "Update a series", "updateSeries", {
        parameters: [versionParameter, idParameter],
        requestSchema: schemaRef("SeriesResource"),
        responseCode: "202",
        responseSchema: schemaRef("SeriesResource"),
      }),
      delete: noContentOperation("Series", "Delete a series", "deleteSeries", [
        versionParameter,
        idParameter,
      ]),
    },
    "/api/{version}/episode": {
      get: operation("Episodes", "List episodes", "listEpisodes", {
        description: "Requires one of seriesId, episodeIds, or episodeFileId.",
        parameters: [
          versionParameter,
          queryParameter("seriesId", "Series id.", { type: "integer", minimum: 1 }),
          queryParameter("seasonNumber", "Season number.", { type: "integer", minimum: 0 }),
          integerListQuery("episodeIds", "Episode ids, repeated or comma-separated."),
          queryParameter("episodeFileId", "Episode file id.", { type: "integer", minimum: 1 }),
          booleanQuery("includeSeries", "Include series resource details."),
        ],
        responseSchema: arraySchema("EpisodeResource"),
      }),
    },
    "/api/{version}/episode/{id}": {
      get: operation("Episodes", "Get an episode", "getEpisode", {
        parameters: [
          versionParameter,
          idParameter,
          booleanQuery("includeSeries", "Include series resource details."),
        ],
        responseSchema: schemaRef("EpisodeResource"),
      }),
      put: operation("Episodes", "Update episode monitored state", "updateEpisode", {
        parameters: [versionParameter, idParameter],
        requestSchema: schemaRef("EpisodeMonitorRequest"),
        responseCode: "202",
        responseSchema: schemaRef("EpisodeResource"),
      }),
    },
    "/api/{version}/indexer": {
      get: operation("Indexers", "List indexers", "listIndexers", {
        parameters: [versionParameter],
        responseSchema: arraySchema("ProviderResource"),
      }),
      post: operation("Indexers", "Create an indexer", "createIndexer", {
        parameters: [versionParameter],
        requestSchema: schemaRef("ProviderResource"),
        responseCode: "201",
        responseSchema: schemaRef("ProviderResource"),
      }),
    },
    "/api/{version}/indexer/{id}": providerItemPath("Indexers", "indexer"),
    "/api/{version}/downloadclient": {
      get: operation("Download Clients", "List download clients", "listDownloadClients", {
        parameters: [versionParameter],
        responseSchema: arraySchema("ProviderResource"),
      }),
      post: operation("Download Clients", "Create a download client", "createDownloadClient", {
        parameters: [versionParameter],
        requestSchema: schemaRef("ProviderResource"),
        responseCode: "201",
        responseSchema: schemaRef("ProviderResource"),
      }),
    },
    "/api/{version}/downloadclient/{id}": providerItemPath("Download Clients", "downloadClient"),
    "/api/{version}/queue": {
      get: operation("Queue", "List queue items", "listCompatibleQueue", {
        parameters: [
          versionParameter,
          pageQuery,
          pageSizeQuery,
          sortKeyQuery,
          sortDirectionQuery,
          integerListQuery("movieIds", "Movie ids, repeated or comma-separated."),
          integerListQuery("seriesIds", "Series ids, repeated or comma-separated."),
          integerListQuery("episodeIds", "Episode ids, repeated or comma-separated."),
          stringListQuery("status", "Queue status values."),
          booleanQuery("includeUnknownMovieItems", "Include unlinked movie queue items."),
          booleanQuery("includeUnknownSeriesItems", "Include unlinked series queue items."),
        ],
        responseSchema: schemaRef("PagedResource"),
      }),
    },
    "/api/{version}/queue/details": {
      get: operation("Queue", "List queue item details", "listCompatibleQueueDetails", {
        parameters: [
          versionParameter,
          pageQuery,
          pageSizeQuery,
          sortKeyQuery,
          sortDirectionQuery,
          stringListQuery("status", "Queue status values."),
        ],
        responseSchema: arraySchema("QueueResource"),
      }),
    },
    "/api/{version}/queue/status": {
      get: operation("Queue", "Get queue status", "getCompatibleQueueStatus", {
        parameters: [versionParameter],
        responseSchema: schemaRef("QueueStatusResource"),
      }),
    },
    "/api/{version}/queue/{id}": {
      delete: noContentOperation("Queue", "Remove a queue item", "deleteCompatibleQueueItem", [
        versionParameter,
        idParameter,
        booleanQuery("removeFromClient", "Also remove the item from the download client."),
        booleanQuery("blocklist", "Blocklist the release while removing it."),
      ]),
    },
    "/api/{version}/history": {
      get: historyOperation("List history", "listCompatibleHistory"),
    },
    "/api/{version}/history/since": {
      get: historyOperation("List history since a date", "listCompatibleHistorySince", [
        queryParameter("date", "Inclusive lower-bound date.", {
          type: "string",
          format: "date-time",
        }),
      ]),
    },
    "/api/{version}/history/movie": {
      get: historyOperation("List movie history", "listCompatibleMovieHistory", [
        queryParameter("movieId", "Movie id.", { type: "integer", minimum: 1 }),
      ]),
    },
    "/api/{version}/history/series": {
      get: historyOperation("List series history", "listCompatibleSeriesHistory", [
        queryParameter("seriesId", "Series id.", { type: "integer", minimum: 1 }),
      ]),
    },
    "/api/{version}/wanted/missing": {
      get: wantedOperation("List missing wanted items", "listWantedMissing"),
    },
    "/api/{version}/wanted/cutoff": {
      get: wantedOperation("List cutoff-unmet wanted items", "listWantedCutoff"),
    },
    "/api/{version}/calendar": {
      get: operation("Calendar", "List calendar items", "listCalendar", {
        parameters: [
          versionParameter,
          queryParameter("start", "Calendar window start.", {
            type: "string",
            format: "date-time",
          }),
          queryParameter("end", "Calendar window end.", { type: "string", format: "date-time" }),
          booleanQuery("includeSeries", "Include series resource details."),
          booleanQuery("includeMovie", "Include movie resource details."),
          booleanQuery("includeEpisodeFile", "Include episode file details."),
        ],
        responseSchema: arraySchema("CalendarResource"),
      }),
    },
    "/api/{version}/calendar/{id}": {
      get: operation("Calendar", "Get a calendar item", "getCalendarItem", {
        parameters: [versionParameter, idParameter],
        responseSchema: schemaRef("CalendarResource"),
      }),
    },
    "/api/{version}/command": {
      get: operation("Commands", "List commands", "listCommands", {
        parameters: [versionParameter],
        responseSchema: arraySchema("CommandResource"),
      }),
      post: operation("Commands", "Create a command", "createCommand", {
        parameters: [versionParameter],
        requestSchema: schemaRef("CommandRequest"),
        responseCode: "201",
        responseSchema: schemaRef("CommandResource"),
      }),
    },
    "/api/{version}/command/{id}": {
      get: operation("Commands", "Get a command", "getCommand", {
        parameters: [versionParameter, idParameter],
        responseSchema: schemaRef("CommandResource"),
      }),
      delete: noContentOperation("Commands", "Cancel a command", "deleteCommand", [
        versionParameter,
        idParameter,
      ]),
    },
    "/api/{version}/tag": {
      get: collectionOperation("Tags", "List tags", "listTags", "TagResource"),
      post: operation("Tags", "Create a tag", "createTag", {
        parameters: [versionParameter],
        requestSchema: schemaRef("TagResource"),
        responseCode: "201",
        responseSchema: schemaRef("TagResource"),
      }),
    },
    "/api/{version}/tag/{id}": mutableResourcePath("Tags", "tag", "TagResource"),
    "/api/{version}/tag/detail": {
      get: collectionOperation("Tags", "List tag details", "listTagDetails", "TagDetailResource"),
    },
    "/api/{version}/tag/detail/{id}": {
      get: operation("Tags", "Get tag details", "getTagDetails", {
        parameters: [versionParameter, idParameter],
        responseSchema: schemaRef("TagDetailResource"),
      }),
    },
    "/api/{version}/rootfolder": {
      get: collectionOperation(
        "Root Folders",
        "List root folders",
        "listRootFolders",
        "RootFolderResource",
      ),
      post: operation("Root Folders", "Create a root folder", "createRootFolder", {
        parameters: [versionParameter],
        requestSchema: schemaRef("RootFolderResource"),
        responseCode: "201",
        responseSchema: schemaRef("RootFolderResource"),
      }),
    },
    "/api/{version}/rootfolder/{id}": mutableResourcePath(
      "Root Folders",
      "rootFolder",
      "RootFolderResource",
    ),
    "/api/{version}/qualityprofile": {
      get: collectionOperation(
        "Profiles",
        "List quality profiles",
        "listQualityProfiles",
        "QualityProfileResource",
      ),
      post: operation("Profiles", "Create a quality profile", "createQualityProfile", {
        parameters: [versionParameter],
        requestSchema: schemaRef("QualityProfileResource"),
        responseCode: "201",
        responseSchema: schemaRef("QualityProfileResource"),
      }),
    },
    "/api/{version}/qualityprofile/{id}": mutableResourcePath(
      "Profiles",
      "qualityProfile",
      "QualityProfileResource",
    ),
    "/api/{version}/customformat": {
      get: collectionOperation(
        "Profiles",
        "List custom formats",
        "listCustomFormats",
        "CustomFormatResource",
      ),
      post: operation("Profiles", "Create a custom format", "createCustomFormat", {
        parameters: [versionParameter],
        requestSchema: schemaRef("CustomFormatResource"),
        responseCode: "201",
        responseSchema: schemaRef("CustomFormatResource"),
      }),
    },
    "/api/{version}/customformat/{id}": mutableResourcePath(
      "Profiles",
      "customFormat",
      "CustomFormatResource",
    ),
    "/api/{version}/system/status": {
      get: operation("System", "Get compatible system status", "getCompatibleSystemStatus", {
        parameters: [versionParameter],
        responseSchema: schemaRef("SystemStatusResource"),
      }),
    },
    "/api/{version}/health": {
      get: operation("System", "List compatible health checks", "listCompatibleHealth", {
        parameters: [versionParameter],
        responseSchema: arraySchema("HealthResource"),
      }),
    },
    "/api/indexers/aggregate/{protocol}": aggregateFeedPath("queryAggregateIndexerFeed"),
    "/api/indexers/aggregate/{protocol}/api": aggregateFeedPath("queryAggregateIndexerFeedApi"),
    "/api/system/health": {
      get: publicOperation("Native", "Get unauthenticated system health", "getSystemHealth"),
    },
    "/api/system/status": {
      get: operation("Native", "Get system status", "getSystemStatus", {
        responseSchema: schemaRef("SystemStatusResource"),
      }),
    },
    "/api/system/tasks": {
      get: operation("Native", "List scheduled tasks", "listSystemTasks", {
        responseSchema: arraySchema("SystemTaskResource"),
      }),
    },
    "/api/system/logs": {
      get: operation("Native", "List system logs", "listSystemLogs", {
        parameters: [
          queryParameter("level", "Log level filter.", {
            type: "string",
            enum: ["debug", "info", "warn", "error"],
          }),
          queryParameter("count", "Maximum number of log entries.", {
            type: "integer",
            minimum: 1,
          }),
        ],
        responseSchema: arraySchema("LogResource"),
      }),
    },
    "/api/system/backups/{id}/download": {
      get: operation("Native", "Download a database backup", "downloadDatabaseBackup", {
        parameters: [backupIdParameter],
        responseContentType: "application/vnd.sqlite3",
        responseSchema: binarySchema(),
      }),
    },
    "/api/queue": {
      get: operation("Native", "List native queue items", "listNativeQueue", {
        parameters: [
          queryParameter("status", "Queue status filter.", { type: "string" }),
          queryParameter("mediaType", "Queue media type filter.", {
            type: "string",
            enum: ["all", "movie", "series", "unlinked"],
          }),
          queryParameter("clientId", "Download client id.", { type: "integer", minimum: 1 }),
        ],
        responseSchema: arraySchema("QueueResource"),
      }),
    },
    "/api/queue/{id}/retry": {
      post: operation("Native", "Retry a native queue item", "retryNativeQueueItem", {
        parameters: [idParameter],
        responseSchema: schemaRef("QueueResource"),
      }),
    },
    "/api/queue/{id}/remove": {
      post: operation("Native", "Remove a native queue item", "removeNativeQueueItem", {
        parameters: [idParameter],
        responseSchema: schemaRef("QueueResource"),
      }),
    },
    "/api/queue/{id}/blocklist": {
      post: operation("Native", "Blocklist a native queue item", "blocklistNativeQueueItem", {
        parameters: [idParameter],
        responseSchema: schemaRef("QueueResource"),
      }),
    },
  } satisfies Record<string, OpenApiPathItem>,
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        description:
          "Bearer token from an ARR Hub session or full-app API credential. REST-scoped API keys should use X-Api-Key or apikey.",
      },
      "X-Api-Key": {
        type: "apiKey",
        in: "header",
        name: "X-Api-Key",
        description:
          "API key passed as a header, matching Radarr/Sonarr/Prowlarr clients. Requires REST read scope for GET/HEAD/OPTIONS and REST write scope for mutating methods.",
      },
      apikey: {
        type: "apiKey",
        in: "query",
        name: "apikey",
        description:
          "API key passed as a query parameter for Arr-compatible clients and feeds. Aggregate feeds require REST read scope.",
      },
    },
    parameters: {
      Version: {
        name: "version",
        in: "path",
        required: true,
        description: "Compatible API version.",
        schema: { type: "string", enum: ["v1", "v3"] },
      },
      Id: {
        name: "id",
        in: "path",
        required: true,
        description: "Numeric ARR Hub resource id unless a route states otherwise.",
        schema: { type: "integer", minimum: 1 },
      },
      BackupId: {
        name: "id",
        in: "path",
        required: true,
        description: "Database backup id returned by the backup listing API.",
        schema: { type: "string", minLength: 1 },
      },
      Protocol: {
        name: "protocol",
        in: "path",
        required: true,
        description: "Aggregate indexer feed protocol.",
        schema: { type: "string", enum: ["torznab", "newznab"] },
      },
    },
    schemas: {
      ErrorResponse: objectSchema({ error: { type: "string" } }),
      PagedResource: objectSchema({
        page: { type: "integer" },
        pageSize: { type: "integer" },
        totalRecords: { type: "integer" },
        records: { type: "array", items: { type: "object", additionalProperties: true } },
      }),
      MovieResource: looseObjectSchema("Arr-compatible movie resource."),
      SeriesResource: looseObjectSchema("Arr-compatible series resource."),
      EpisodeResource: looseObjectSchema("Arr-compatible episode resource."),
      EpisodeMonitorRequest: objectSchema({ monitored: { type: "boolean" } }),
      ProviderResource: looseObjectSchema(
        "Arr-compatible indexer or download-client provider resource.",
      ),
      QueueResource: looseObjectSchema("Arr-compatible queue resource."),
      QueueStatusResource: looseObjectSchema("Arr-compatible queue status resource."),
      HistoryResource: looseObjectSchema("Arr-compatible history resource."),
      WantedResource: looseObjectSchema("Arr-compatible wanted item resource."),
      CalendarResource: looseObjectSchema("Arr-compatible calendar item resource."),
      CommandResource: looseObjectSchema("Arr-compatible command resource."),
      CommandRequest: looseObjectSchema("Arr-compatible command request."),
      TagResource: looseObjectSchema("Arr-compatible tag resource."),
      TagDetailResource: looseObjectSchema("Arr-compatible tag detail resource."),
      RootFolderResource: looseObjectSchema("Arr-compatible root folder resource."),
      QualityProfileResource: looseObjectSchema("Arr-compatible quality profile resource."),
      CustomFormatResource: looseObjectSchema("Arr-compatible custom format resource."),
      SystemStatusResource: looseObjectSchema("System status resource."),
      HealthResource: looseObjectSchema("Health check resource."),
      SystemTaskResource: looseObjectSchema("System task resource."),
      LogResource: looseObjectSchema("System log resource."),
      BinaryFile: binarySchema(),
    },
  },
} as const

interface RouteHandlerArgs {
  readonly request: Request
}

export function openApiHandler(): Response {
  return Response.json(publicOpenApiDocument, {
    headers: {
      "cache-control": "no-store",
    },
  })
}

export function compatibleOpenApiHandler({ request }: RouteHandlerArgs): Response {
  const version = new URL(request.url).pathname.split("/")[2]
  if (version !== "v1" && version !== "v3") {
    return Response.json({ error: "unsupported api version" }, { status: 404 })
  }
  return openApiHandler()
}

function providerItemPath(tag: string, operationName: string): OpenApiPathItem {
  return {
    get: operation(tag, `Get a ${operationName}`, `get${pascalCase(operationName)}`, {
      parameters: [versionParameter, idParameter],
      responseSchema: schemaRef("ProviderResource"),
    }),
    put: operation(tag, `Update a ${operationName}`, `update${pascalCase(operationName)}`, {
      parameters: [versionParameter, idParameter],
      requestSchema: schemaRef("ProviderResource"),
      responseCode: "202",
      responseSchema: schemaRef("ProviderResource"),
    }),
    delete: noContentOperation(
      tag,
      `Delete a ${operationName}`,
      `delete${pascalCase(operationName)}`,
      [versionParameter, idParameter],
    ),
  }
}

function mutableResourcePath(
  tag: string,
  operationName: string,
  schemaName: string,
): OpenApiPathItem {
  const name = pascalCase(operationName)
  return {
    get: operation(tag, `Get a ${operationName}`, `get${name}`, {
      parameters: [versionParameter, idParameter],
      responseSchema: schemaRef(schemaName),
    }),
    put: operation(tag, `Update a ${operationName}`, `update${name}`, {
      parameters: [versionParameter, idParameter],
      requestSchema: schemaRef(schemaName),
      responseCode: "202",
      responseSchema: schemaRef(schemaName),
    }),
    delete: noContentOperation(tag, `Delete a ${operationName}`, `delete${name}`, [
      versionParameter,
      idParameter,
    ]),
  }
}

function collectionOperation(
  tag: string,
  summary: string,
  operationId: string,
  schemaName: string,
): OpenApiOperation {
  return operation(tag, summary, operationId, {
    parameters: [versionParameter],
    responseSchema: arraySchema(schemaName),
  })
}

function historyOperation(
  summary: string,
  operationId: string,
  extraParameters: ReadonlyArray<OpenApiParameter> = [],
): OpenApiOperation {
  return operation("History", summary, operationId, {
    parameters: [
      versionParameter,
      pageQuery,
      pageSizeQuery,
      sortKeyQuery,
      sortDirectionQuery,
      stringListQuery("eventType", "History event type values."),
      queryParameter("downloadId", "Download client external id.", { type: "string" }),
      integerListQuery("movieIds", "Movie ids, repeated or comma-separated."),
      integerListQuery("seriesIds", "Series ids, repeated or comma-separated."),
      queryParameter("episodeId", "Episode id.", { type: "integer", minimum: 1 }),
      ...extraParameters,
    ],
    responseSchema: schemaRef("PagedResource"),
  })
}

function wantedOperation(summary: string, operationId: string): OpenApiOperation {
  return operation("Wanted", summary, operationId, {
    parameters: [
      versionParameter,
      pageQuery,
      pageSizeQuery,
      sortKeyQuery,
      sortDirectionQuery,
      booleanQuery("monitored", "Filter by monitored state."),
      integerListQuery("movieIds", "Movie ids, repeated or comma-separated."),
      integerListQuery("seriesIds", "Series ids, repeated or comma-separated."),
    ],
    responseSchema: schemaRef("PagedResource"),
  })
}

function aggregateFeedPath(operationId: string): OpenApiPathItem {
  return {
    get: operation("Indexers", "Query aggregate Torznab/Newznab feed", operationId, {
      parameters: [
        { $ref: "#/components/parameters/Protocol" },
        queryParameter("apikey", "API key.", { type: "string" }),
        queryParameter("t", "Feed function such as caps, search, tvsearch, or movie.", {
          type: "string",
        }),
        queryParameter("q", "Search query.", { type: "string" }),
        queryParameter("cat", "Categories, comma-separated.", { type: "string" }),
        queryParameter("offset", "Result offset.", { type: "integer", minimum: 0 }),
        queryParameter("limit", "Result limit.", { type: "integer", minimum: 1 }),
      ],
      responseContentType: XML_MEDIA_TYPE,
      responseSchema: { type: "string" },
      security: queryApiKeySecurity,
    }),
  }
}

function publicOperation(
  tag: string,
  summary: string,
  operationId: string,
  parameters: ReadonlyArray<OpenApiParameter | { readonly $ref: string }> = [],
): OpenApiOperation {
  return operation(tag, summary, operationId, {
    parameters,
    responseSchema: { type: "object", additionalProperties: true },
    security: [],
  })
}

function noContentOperation(
  tag: string,
  summary: string,
  operationId: string,
  parameters: ReadonlyArray<OpenApiParameter | { readonly $ref: string }>,
): OpenApiOperation {
  return operation(tag, summary, operationId, {
    parameters,
    responseCode: "204",
    responseSchema: null,
  })
}

function operation(
  tag: string,
  summary: string,
  operationId: string,
  options: {
    readonly description?: string
    readonly parameters?: ReadonlyArray<OpenApiParameter | { readonly $ref: string }>
    readonly requestSchema?: Record<string, unknown>
    readonly responseCode?: string
    readonly responseContentType?: string
    readonly responseSchema?: Record<string, unknown> | null
    readonly security?: ReadonlyArray<Record<string, ReadonlyArray<string>>>
  },
): OpenApiOperation {
  const responseCode = options.responseCode ?? "200"
  const responseSchema = options.responseSchema ?? { type: "object", additionalProperties: true }
  return {
    tags: [tag],
    summary,
    ...(options.description ? { description: options.description } : {}),
    operationId,
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(options.requestSchema
      ? {
          requestBody: {
            required: true,
            content: {
              [JSON_MEDIA_TYPE]: { schema: options.requestSchema },
            },
          },
        }
      : {}),
    responses: {
      [responseCode]: responseSchema
        ? {
            description: responseCode === "201" ? "Created." : "Successful response.",
            content: {
              [options.responseContentType ?? JSON_MEDIA_TYPE]: { schema: responseSchema },
            },
          }
        : { description: "No content." },
      "400": errorResponse("Invalid request."),
      "401": errorResponse("Missing or invalid API key."),
      "404": errorResponse("Resource not found."),
      "500": errorResponse("Unexpected server error."),
    },
    ...(options.security ? { security: options.security } : {}),
  }
}

function errorResponse(description: string) {
  return {
    description,
    content: {
      [JSON_MEDIA_TYPE]: { schema: schemaRef("ErrorResponse") },
    },
  }
}

function queryParameter(
  name: string,
  description: string,
  schema: Record<string, unknown>,
): OpenApiParameter {
  return { name, in: "query", description, schema }
}

function booleanQuery(name: string, description: string): OpenApiParameter {
  return queryParameter(name, description, { type: "boolean" })
}

function integerListQuery(name: string, description: string): OpenApiParameter {
  return {
    name,
    in: "query",
    description,
    schema: { type: "array", items: { type: "integer", minimum: 1 } },
    style: "form",
    explode: true,
  }
}

function stringListQuery(name: string, description: string): OpenApiParameter {
  return {
    name,
    in: "query",
    description,
    schema: { type: "array", items: { type: "string" } },
    style: "form",
    explode: true,
  }
}

function arraySchema(schemaName: string): Record<string, unknown> {
  return { type: "array", items: schemaRef(schemaName) }
}

function schemaRef(name: string): Record<string, unknown> {
  return { $ref: `#/components/schemas/${name}` }
}

function objectSchema(
  properties: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  return { type: "object", properties, additionalProperties: false }
}

function looseObjectSchema(description: string): Record<string, unknown> {
  return { type: "object", description, additionalProperties: true }
}

function binarySchema(): Record<string, unknown> {
  return { type: "string", format: "binary" }
}

function pascalCase(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1)
}
