import { describe, expect, it } from "@effect/vitest"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"

import { users, apiKeys, loginAttempts } from "#/db/schema"
import { TestDbLive } from "#/effect/test/TestDb"

import { AuthService, AuthServiceLive, tokenAllowsScope } from "./AuthService"
import { CryptoService, CryptoServiceLive } from "./CryptoService"
import { Db } from "./Db"

const TestLayer = AuthServiceLive.pipe(
  Layer.provideMerge(CryptoServiceLive),
  Layer.provideMerge(TestDbLive),
)

function restoreRecoveryToken(value: string | undefined) {
  if (value === undefined) {
    delete process.env.ARR_HUB_PASSWORD_RECOVERY_TOKEN
  } else {
    process.env.ARR_HUB_PASSWORD_RECOVERY_TOKEN = value
  }
}

/** Insert a test user, return its id. */
const seedUser = (username: string, password: string) =>
  Effect.gen(function* () {
    const db = yield* Db
    const crypto = yield* CryptoService
    const passwordHash = yield* crypto.hashPassword(password)
    const rows = yield* db
      .insert(users)
      .values({ username, passwordHash })
      .returning({ id: users.id })
    return rows[0].id
  })

describe("AuthService", () => {
  it.effect("login succeeds with correct credentials", () =>
    Effect.gen(function* () {
      yield* seedUser("alice", "pass123")
      const auth = yield* AuthService
      const result = yield* auth.login("alice", "pass123")
      expect(result.token).toHaveLength(64)
      expect(result.expiresAt).toBeInstanceOf(Date)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("login fails with wrong password", () =>
    Effect.gen(function* () {
      yield* seedUser("bob", "correct")
      const auth = yield* AuthService
      const error = yield* Effect.flip(auth.login("bob", "wrong"))
      expect(error._tag).toBe("AuthError")
      if (error._tag === "AuthError") expect(error.reason).toBe("invalid_credentials")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("login locks a username after repeated failures", () =>
    Effect.gen(function* () {
      yield* seedUser("locked", "correct")
      const auth = yield* AuthService

      for (let i = 0; i < 4; i++) {
        const error = yield* Effect.flip(auth.login("locked", "wrong"))
        expect(error._tag).toBe("AuthError")
        if (error._tag === "AuthError") expect(error.reason).toBe("invalid_credentials")
      }

      const lockoutError = yield* Effect.flip(auth.login("locked", "wrong"))
      expect(lockoutError._tag).toBe("AuthError")
      if (lockoutError._tag === "AuthError") expect(lockoutError.reason).toBe("rate_limited")

      const correctPasswordError = yield* Effect.flip(auth.login("locked", "correct"))
      expect(correctPasswordError._tag).toBe("AuthError")
      if (correctPasswordError._tag === "AuthError") {
        expect(correctPasswordError.reason).toBe("rate_limited")
      }

      const db = yield* Db
      const attempts = yield* db
        .select()
        .from(loginAttempts)
        .where(eq(loginAttempts.loginKey, "locked"))
      expect(attempts[0]?.failedCount).toBe(5)
      expect(attempts[0]?.lockedUntil).toBeInstanceOf(Date)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("successful login clears previous failed attempts", () =>
    Effect.gen(function* () {
      yield* seedUser("recover", "correct")
      const auth = yield* AuthService

      yield* Effect.flip(auth.login("recover", "wrong"))
      yield* Effect.flip(auth.login("recover", "wrong"))

      const result = yield* auth.login("recover", "correct")
      expect(result.token).toHaveLength(64)

      const db = yield* Db
      const attempts = yield* db
        .select()
        .from(loginAttempts)
        .where(eq(loginAttempts.loginKey, "recover"))
      expect(attempts).toHaveLength(0)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("login fails with unknown user", () =>
    Effect.gen(function* () {
      const auth = yield* AuthService
      const error = yield* Effect.flip(auth.login("ghost", "whatever"))
      expect(error._tag).toBe("AuthError")
      if (error._tag === "AuthError") expect(error.reason).toBe("invalid_credentials")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("validateToken succeeds with valid session", () =>
    Effect.gen(function* () {
      yield* seedUser("carol", "pass")
      const auth = yield* AuthService
      const session = yield* auth.login("carol", "pass")
      const validated = yield* auth.validateToken(session.token)
      expect(validated.kind).toBe("session")
      expect(typeof validated.userId).toBe("number")
      expect(typeof validated.keyId).toBe("number")
      expect(validated.scopes).toEqual(["app"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("validateToken fails with unknown token", () =>
    Effect.gen(function* () {
      const auth = yield* AuthService
      const error = yield* Effect.flip(auth.validateToken("deadbeef".repeat(8)))
      expect(error._tag).toBe("AuthError")
      if (error._tag === "AuthError") expect(error.reason).toBe("missing")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("validateToken fails with expired session", () =>
    Effect.gen(function* () {
      yield* seedUser("dave", "pass")
      const auth = yield* AuthService
      const session = yield* auth.login("dave", "pass")

      // Expire the session by setting expiresAt in the past
      const db = yield* Db
      const crypto = yield* CryptoService
      const hash = yield* crypto.hashToken(session.token)
      yield* db
        .update(apiKeys)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(apiKeys.tokenHash, hash))

      const error = yield* Effect.flip(auth.validateToken(session.token))
      expect(error._tag).toBe("AuthError")
      if (error._tag === "AuthError") expect(error.reason).toBe("expired")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("validateToken fails with revoked token", () =>
    Effect.gen(function* () {
      yield* seedUser("eve", "pass")
      const auth = yield* AuthService
      const session = yield* auth.login("eve", "pass")
      const validated = yield* auth.validateToken(session.token)

      yield* auth.revokeApiKey(validated.keyId)

      const error = yield* Effect.flip(auth.validateToken(session.token))
      expect(error._tag).toBe("AuthError")
      if (error._tag === "AuthError") expect(error.reason).toBe("missing")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("changePassword updates credentials and revokes active sessions", () =>
    Effect.gen(function* () {
      const userId = yield* seedUser("change-me", "old-password")
      const auth = yield* AuthService
      const session = yield* auth.login("change-me", "old-password")

      yield* auth.changePassword(userId, "old-password", "new-password")

      const oldSessionError = yield* Effect.flip(auth.validateToken(session.token))
      expect(oldSessionError._tag).toBe("AuthError")
      if (oldSessionError._tag === "AuthError") expect(oldSessionError.reason).toBe("missing")

      const oldPasswordError = yield* Effect.flip(auth.login("change-me", "old-password"))
      expect(oldPasswordError._tag).toBe("AuthError")
      if (oldPasswordError._tag === "AuthError") {
        expect(oldPasswordError.reason).toBe("invalid_credentials")
      }

      const nextSession = yield* auth.login("change-me", "new-password")
      expect(nextSession.token).toHaveLength(64)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("changePassword rejects wrong current password", () =>
    Effect.gen(function* () {
      const userId = yield* seedUser("reject-change", "old-password")
      const auth = yield* AuthService

      const error = yield* Effect.flip(
        auth.changePassword(userId, "wrong-password", "new-password"),
      )
      expect(error._tag).toBe("AuthError")
      if (error._tag === "AuthError") expect(error.reason).toBe("invalid_credentials")

      const session = yield* auth.login("reject-change", "old-password")
      expect(session.token).toHaveLength(64)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("changePassword validates the new password length", () =>
    Effect.gen(function* () {
      const userId = yield* seedUser("short-change", "old-password")
      const auth = yield* AuthService

      const error = yield* Effect.flip(auth.changePassword(userId, "old-password", "short"))
      expect(error._tag).toBe("ValidationError")
      if (error._tag === "ValidationError") {
        expect(error.message).toBe("password must be at least 8 characters")
      }

      const session = yield* auth.login("short-change", "old-password")
      expect(session.token).toHaveLength(64)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("recoverPassword updates credentials and revokes active tokens", () =>
    Effect.gen(function* () {
      const previousToken = process.env.ARR_HUB_PASSWORD_RECOVERY_TOKEN
      process.env.ARR_HUB_PASSWORD_RECOVERY_TOKEN = "unit-test-recovery-token"

      try {
        const userId = yield* seedUser("recover-me", "old-password")
        const auth = yield* AuthService
        const session = yield* auth.login("recover-me", "old-password")
        const apiKey = yield* auth.createApiKey(userId, "automation")

        yield* auth.recoverPassword("recover-me", "unit-test-recovery-token", "new-password")

        const oldSessionError = yield* Effect.flip(auth.validateToken(session.token))
        expect(oldSessionError._tag).toBe("AuthError")
        if (oldSessionError._tag === "AuthError") expect(oldSessionError.reason).toBe("missing")

        const apiKeyError = yield* Effect.flip(auth.validateToken(apiKey.token))
        expect(apiKeyError._tag).toBe("AuthError")
        if (apiKeyError._tag === "AuthError") expect(apiKeyError.reason).toBe("missing")

        const oldPasswordError = yield* Effect.flip(auth.login("recover-me", "old-password"))
        expect(oldPasswordError._tag).toBe("AuthError")
        if (oldPasswordError._tag === "AuthError") {
          expect(oldPasswordError.reason).toBe("invalid_credentials")
        }

        const nextSession = yield* auth.login("recover-me", "new-password")
        expect(nextSession.token).toHaveLength(64)
      } finally {
        restoreRecoveryToken(previousToken)
      }
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("recoverPassword rejects missing recovery configuration", () =>
    Effect.gen(function* () {
      const previousToken = process.env.ARR_HUB_PASSWORD_RECOVERY_TOKEN
      delete process.env.ARR_HUB_PASSWORD_RECOVERY_TOKEN

      try {
        yield* seedUser("disabled-recovery", "old-password")
        const auth = yield* AuthService
        const error = yield* Effect.flip(
          auth.recoverPassword("disabled-recovery", "token", "new-password"),
        )
        expect(error._tag).toBe("ValidationError")
        if (error._tag === "ValidationError") {
          expect(error.message).toBe("password recovery is not configured")
        }
      } finally {
        restoreRecoveryToken(previousToken)
      }
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("recoverPassword rejects invalid recovery tokens without changing password", () =>
    Effect.gen(function* () {
      const previousToken = process.env.ARR_HUB_PASSWORD_RECOVERY_TOKEN
      process.env.ARR_HUB_PASSWORD_RECOVERY_TOKEN = "unit-test-recovery-token"

      try {
        yield* seedUser("bad-recovery", "old-password")
        const auth = yield* AuthService
        const error = yield* Effect.flip(
          auth.recoverPassword("bad-recovery", "wrong-token", "new-password"),
        )
        expect(error._tag).toBe("AuthError")
        if (error._tag === "AuthError") expect(error.reason).toBe("invalid_credentials")

        const oldSession = yield* auth.login("bad-recovery", "old-password")
        expect(oldSession.token).toHaveLength(64)

        const newPasswordError = yield* Effect.flip(auth.login("bad-recovery", "new-password"))
        expect(newPasswordError._tag).toBe("AuthError")
        if (newPasswordError._tag === "AuthError") {
          expect(newPasswordError.reason).toBe("invalid_credentials")
        }
      } finally {
        restoreRecoveryToken(previousToken)
      }
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("recoverPassword validates the new password length", () =>
    Effect.gen(function* () {
      const previousToken = process.env.ARR_HUB_PASSWORD_RECOVERY_TOKEN
      process.env.ARR_HUB_PASSWORD_RECOVERY_TOKEN = "unit-test-recovery-token"

      try {
        yield* seedUser("short-recovery", "old-password")
        const auth = yield* AuthService
        const error = yield* Effect.flip(
          auth.recoverPassword("short-recovery", "unit-test-recovery-token", "short"),
        )
        expect(error._tag).toBe("ValidationError")
        if (error._tag === "ValidationError") {
          expect(error.message).toBe("password must be at least 8 characters")
        }

        const session = yield* auth.login("short-recovery", "old-password")
        expect(session.token).toHaveLength(64)
      } finally {
        restoreRecoveryToken(previousToken)
      }
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("createApiKey returns raw token + id", () =>
    Effect.gen(function* () {
      const userId = yield* seedUser("frank", "pass")
      const auth = yield* AuthService
      const result = yield* auth.createApiKey(userId, "my-key")
      expect(typeof result.id).toBe("number")
      expect(result.token).toHaveLength(64)
      expect(result.scopes).toEqual(["app"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("validateToken works with API key", () =>
    Effect.gen(function* () {
      const userId = yield* seedUser("grace", "pass")
      const auth = yield* AuthService
      const apiKey = yield* auth.createApiKey(userId, "test-key")
      const validated = yield* auth.validateToken(apiKey.token)
      expect(validated.kind).toBe("api_key")
      expect(validated.userId).toBe(userId)
      expect(validated.scopes).toEqual(["app"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("createApiKey stores and validates scoped API keys", () =>
    Effect.gen(function* () {
      const userId = yield* seedUser("scoped", "pass")
      const auth = yield* AuthService
      const apiKey = yield* auth.createApiKey(userId, "read-write", ["api:read", "api:write"])
      const validated = yield* auth.validateToken(apiKey.token)

      expect(apiKey.scopes).toEqual(["api:read", "api:write"])
      expect(validated.scopes).toEqual(["api:read", "api:write"])
      expect(tokenAllowsScope(validated, "api:read")).toBe(true)
      expect(tokenAllowsScope(validated, "api:write")).toBe(true)
      expect(tokenAllowsScope(validated, "app")).toBe(false)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("API write scope implies API read scope", () =>
    Effect.gen(function* () {
      const userId = yield* seedUser("write-scoped", "pass")
      const auth = yield* AuthService
      const apiKey = yield* auth.createApiKey(userId, "write-only", ["api:write"])
      const validated = yield* auth.validateToken(apiKey.token)

      expect(tokenAllowsScope(validated, "api:read")).toBe(true)
      expect(tokenAllowsScope(validated, "api:write")).toBe(true)
      expect(tokenAllowsScope(validated, "app")).toBe(false)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("listApiKeys returns both session and API keys for a user", () =>
    Effect.gen(function* () {
      const userId = yield* seedUser("henry", "pass")
      const auth = yield* AuthService

      yield* auth.login("henry", "pass")
      yield* auth.createApiKey(userId, "automation")

      const keys = yield* auth.listApiKeys(userId)
      expect(keys.length).toBeGreaterThanOrEqual(2)
      expect(keys.some((k) => k.kind === "session")).toBe(true)
      expect(keys.some((k) => k.kind === "api_key" && k.name === "automation")).toBe(true)
      expect(keys.every((k) => k.scopes.length > 0)).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )
})
