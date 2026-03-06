import { describe, expect, it } from "@effect/vitest"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"

import { users, apiKeys } from "#/db/schema"
import { TestDbLive } from "#/effect/test/TestDb"

import { AuthService, AuthServiceLive } from "./AuthService"
import { CryptoService, CryptoServiceLive } from "./CryptoService"
import { Db } from "./Db"

const TestLayer = AuthServiceLive.pipe(
  Layer.provideMerge(CryptoServiceLive),
  Layer.provideMerge(TestDbLive),
)

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

  it.effect("createApiKey returns raw token + id", () =>
    Effect.gen(function* () {
      const userId = yield* seedUser("frank", "pass")
      const auth = yield* AuthService
      const result = yield* auth.createApiKey(userId, "my-key")
      expect(typeof result.id).toBe("number")
      expect(result.token).toHaveLength(64)
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
    }).pipe(Effect.provide(TestLayer)),
  )
})
