import { describe, expect, it } from "vitest"

import { resolveInitialAdminPassword } from "./bootstrap"

describe("bootstrap safety", () => {
  it("uses configured admin password when provided", () => {
    const password = resolveInitialAdminPassword({
      NODE_ENV: "production",
      INITIAL_ADMIN_PASSWORD: "strong-password",
    })
    expect(password).toBe("strong-password")
  })

  it("throws in production when INITIAL_ADMIN_PASSWORD is missing", () => {
    expect(() => resolveInitialAdminPassword({ NODE_ENV: "production" })).toThrow(
      /INITIAL_ADMIN_PASSWORD is required in production/,
    )
  })

  it("falls back to dev default outside production", () => {
    const password = resolveInitialAdminPassword({ NODE_ENV: "development" })
    expect(password).toBe("admin")
  })
})
