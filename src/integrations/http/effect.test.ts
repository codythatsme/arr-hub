import { describe, expect, it } from "vitest"

import { authTokenFromRequest } from "./auth"
import { requiredApiKeyScopeForMethod } from "./effect"

describe("HTTP auth helpers", () => {
  it("extracts bearer, X-Api-Key, and apikey tokens", () => {
    expect(
      authTokenFromRequest(
        new Request("http://localhost/api/v3/tag", {
          headers: { authorization: "Bearer session-token" },
        }),
      ),
    ).toBe("session-token")

    expect(
      authTokenFromRequest(
        new Request("http://localhost/api/v3/tag", {
          headers: { "X-Api-Key": " api-token " },
        }),
      ),
    ).toBe("api-token")

    expect(
      authTokenFromRequest(new Request("http://localhost/api/v3/tag?apikey=query-token")),
    ).toBe("query-token")
  })

  it("maps safe HTTP methods to read scope", () => {
    expect(requiredApiKeyScopeForMethod("GET")).toBe("api:read")
    expect(requiredApiKeyScopeForMethod("head")).toBe("api:read")
    expect(requiredApiKeyScopeForMethod("OPTIONS")).toBe("api:read")
  })

  it("maps mutating HTTP methods to write scope", () => {
    expect(requiredApiKeyScopeForMethod("POST")).toBe("api:write")
    expect(requiredApiKeyScopeForMethod("PUT")).toBe("api:write")
    expect(requiredApiKeyScopeForMethod("PATCH")).toBe("api:write")
    expect(requiredApiKeyScopeForMethod("DELETE")).toBe("api:write")
  })
})
