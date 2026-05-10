import { describe, expect, it } from "vitest"

import { authTokenFromRequest } from "./auth"

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
})
