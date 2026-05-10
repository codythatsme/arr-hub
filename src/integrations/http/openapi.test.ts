import { describe, expect, it } from "vitest"

import { compatibleOpenApiHandler, openApiHandler, publicOpenApiDocument } from "./openapi"

describe("public OpenAPI document", () => {
  it("documents implemented public REST surfaces and supported auth schemes", () => {
    expect(publicOpenApiDocument.openapi).toBe("3.1.0")
    expect(publicOpenApiDocument.components.securitySchemes).toMatchObject({
      BearerAuth: { type: "http", scheme: "bearer" },
      "X-Api-Key": { type: "apiKey", in: "header", name: "X-Api-Key" },
      apikey: { type: "apiKey", in: "query", name: "apikey" },
    })

    expect(publicOpenApiDocument.paths["/api/{version}/movie"]?.get?.operationId).toBe("listMovies")
    expect(publicOpenApiDocument.paths["/api/{version}/downloadclient"]?.post?.operationId).toBe(
      "createDownloadClient",
    )
    expect(
      publicOpenApiDocument.paths["/api/indexers/aggregate/{protocol}"]?.get?.security,
    ).toEqual([{ apikey: [] }])
    expect(publicOpenApiDocument.paths["/api/system/health"]?.get?.security).toEqual([])
  })

  it("marks compatible routes as v1/v3 only", () => {
    expect(publicOpenApiDocument.components.parameters.Version.schema).toEqual({
      type: "string",
      enum: ["v1", "v3"],
    })
  })

  it("serves the document and rejects unsupported compatible versions", async () => {
    expect(await openApiHandler().json()).toMatchObject({ openapi: "3.1.0" })

    const valid = compatibleOpenApiHandler({
      request: new Request("http://localhost/api/v3/openapi"),
    })
    expect(valid.status).toBe(200)

    const invalid = compatibleOpenApiHandler({
      request: new Request("http://localhost/api/v2/openapi"),
    })
    expect(invalid.status).toBe(404)
    await expect(invalid.json()).resolves.toEqual({ error: "unsupported api version" })
  })
})
