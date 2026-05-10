import { timingSafeEqual } from "node:crypto"

import { SqlError } from "@effect/sql/SqlError"
import { and, desc, eq, isNull } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { users, apiKeys, loginAttempts } from "#/db/schema"

import { AuthError, ValidationError } from "../errors"
import { CryptoService } from "./CryptoService"
import { Db } from "./Db"

interface SessionResult {
  readonly token: string
  readonly expiresAt: Date
}

interface ApiKeyResult {
  readonly id: number
  readonly token: string
}

interface ValidatedUser {
  readonly userId: number
  readonly keyId: number
  readonly kind: "session" | "api_key"
}

interface ApiKeySummary {
  readonly id: number
  readonly kind: "session" | "api_key"
  readonly name: string
  readonly lastUsedAt: Date | null
  readonly expiresAt: Date | null
  readonly revokedAt: Date | null
  readonly createdAt: Date
}

export class AuthService extends Context.Tag("AuthService")<
  AuthService,
  {
    readonly login: (
      username: string,
      password: string,
    ) => Effect.Effect<SessionResult, AuthError | SqlError>
    readonly changePassword: (
      userId: number,
      currentPassword: string,
      newPassword: string,
    ) => Effect.Effect<void, AuthError | ValidationError | SqlError>
    readonly recoverPassword: (
      username: string,
      recoveryToken: string,
      newPassword: string,
    ) => Effect.Effect<void, AuthError | ValidationError | SqlError>
    readonly validateToken: (token: string) => Effect.Effect<ValidatedUser, AuthError | SqlError>
    readonly createApiKey: (userId: number, name: string) => Effect.Effect<ApiKeyResult, SqlError>
    readonly revokeApiKey: (id: number) => Effect.Effect<void, SqlError>
    readonly listApiKeys: (userId: number) => Effect.Effect<ReadonlyArray<ApiKeySummary>, SqlError>
  }
>() {}

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000
const LOGIN_LOCKOUT_THRESHOLD = 5
const PASSWORD_RECOVERY_TOKEN_MIN_LENGTH = 16

function loginKey(username: string): string {
  return username.trim().toLowerCase()
}

function validateNewPassword(password: string): ValidationError | null {
  if (password.length >= 8) return null
  return new ValidationError({ message: "password must be at least 8 characters" })
}

function configuredRecoveryToken(): string | ValidationError {
  const token = process.env.ARR_HUB_PASSWORD_RECOVERY_TOKEN?.trim()
  if (!token) {
    return new ValidationError({ message: "password recovery is not configured" })
  }
  if (token.length < PASSWORD_RECOVERY_TOKEN_MIN_LENGTH) {
    return new ValidationError({
      message: `ARR_HUB_PASSWORD_RECOVERY_TOKEN must be at least ${PASSWORD_RECOVERY_TOKEN_MIN_LENGTH} characters`,
    })
  }
  return token
}

function recoveryTokenMatches(input: string, configured: string): boolean {
  const configuredBuffer = Buffer.from(configured)
  const inputBuffer = Buffer.from(input)
  if (inputBuffer.length !== configuredBuffer.length) {
    const paddedInput = Buffer.alloc(configuredBuffer.length)
    inputBuffer.copy(paddedInput, 0, 0, Math.min(inputBuffer.length, configuredBuffer.length))
    timingSafeEqual(paddedInput, configuredBuffer)
    return false
  }
  return timingSafeEqual(inputBuffer, configuredBuffer)
}

export const AuthServiceLive = Layer.effect(
  AuthService,
  Effect.gen(function* () {
    const db = yield* Db
    const crypto = yield* CryptoService

    const assertLoginAllowed = (key: string, now: Date) =>
      Effect.gen(function* () {
        const attempts = yield* db
          .select()
          .from(loginAttempts)
          .where(eq(loginAttempts.loginKey, key))

        const attempt = attempts[0]
        if (attempt?.lockedUntil && attempt.lockedUntil > now) {
          return yield* new AuthError({ reason: "rate_limited" })
        }
      })

    const recordLoginFailure = (key: string, now: Date) =>
      Effect.gen(function* () {
        const attempts = yield* db
          .select()
          .from(loginAttempts)
          .where(eq(loginAttempts.loginKey, key))

        const attempt = attempts[0]
        const windowExpired =
          !attempt || now.getTime() - attempt.firstFailedAt.getTime() > LOGIN_FAILURE_WINDOW_MS
        const failedCount = windowExpired ? 1 : attempt.failedCount + 1
        const firstFailedAt = windowExpired ? now : attempt.firstFailedAt
        const lockedUntil =
          failedCount >= LOGIN_LOCKOUT_THRESHOLD ? new Date(now.getTime() + LOGIN_LOCKOUT_MS) : null

        if (!attempt) {
          yield* db.insert(loginAttempts).values({
            loginKey: key,
            failedCount,
            firstFailedAt,
            lastFailedAt: now,
            lockedUntil,
          })
        } else {
          yield* db
            .update(loginAttempts)
            .set({ failedCount, firstFailedAt, lastFailedAt: now, lockedUntil })
            .where(eq(loginAttempts.id, attempt.id))
        }

        if (lockedUntil) {
          return yield* new AuthError({ reason: "rate_limited" })
        }
      })

    const clearLoginFailures = (key: string) =>
      db.delete(loginAttempts).where(eq(loginAttempts.loginKey, key))

    return {
      login: (username, password) =>
        Effect.gen(function* () {
          const key = loginKey(username)
          const now = new Date()

          yield* assertLoginAllowed(key, now)

          const rows = yield* db.select().from(users).where(eq(users.username, username))

          const user = rows[0]
          if (!user) {
            yield* recordLoginFailure(key, now)
            return yield* new AuthError({ reason: "invalid_credentials" })
          }

          const valid = yield* crypto.verifyPassword(password, user.passwordHash)
          if (!valid) {
            yield* recordLoginFailure(key, now)
            return yield* new AuthError({ reason: "invalid_credentials" })
          }

          yield* clearLoginFailures(key)

          const rawToken = yield* crypto.generateToken()
          const tokenHash = yield* crypto.hashToken(rawToken)
          const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)

          yield* db.insert(apiKeys).values({
            userId: user.id,
            kind: "session",
            name: "session",
            tokenHash,
            expiresAt,
          })

          return { token: rawToken, expiresAt }
        }),

      validateToken: (token) =>
        Effect.gen(function* () {
          const tokenHash = yield* crypto.hashToken(token)

          const rows = yield* db
            .select()
            .from(apiKeys)
            .where(and(eq(apiKeys.tokenHash, tokenHash), isNull(apiKeys.revokedAt)))

          const key = rows[0]
          if (!key) {
            return yield* new AuthError({ reason: "missing" })
          }

          if (key.expiresAt && key.expiresAt < new Date()) {
            return yield* new AuthError({ reason: "expired" })
          }

          yield* db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id))

          return { userId: key.userId, keyId: key.id, kind: key.kind }
        }),

      changePassword: (userId, currentPassword, newPassword) =>
        Effect.gen(function* () {
          const passwordError = validateNewPassword(newPassword)
          if (passwordError) return yield* passwordError

          const rows = yield* db.select().from(users).where(eq(users.id, userId))
          const user = rows[0]
          if (!user) {
            return yield* new AuthError({ reason: "missing" })
          }

          const valid = yield* crypto.verifyPassword(currentPassword, user.passwordHash)
          if (!valid) {
            return yield* new AuthError({ reason: "invalid_credentials" })
          }

          const passwordHash = yield* crypto.hashPassword(newPassword)
          const now = new Date()

          yield* db.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, userId))

          yield* db
            .update(apiKeys)
            .set({ revokedAt: now })
            .where(
              and(
                eq(apiKeys.userId, userId),
                eq(apiKeys.kind, "session"),
                isNull(apiKeys.revokedAt),
              ),
            )

          yield* clearLoginFailures(loginKey(user.username))
        }),

      recoverPassword: (username, recoveryToken, newPassword) =>
        Effect.gen(function* () {
          const passwordError = validateNewPassword(newPassword)
          if (passwordError) return yield* passwordError

          const configuredToken = configuredRecoveryToken()
          if (configuredToken instanceof ValidationError) return yield* configuredToken

          const key = loginKey(username)
          const now = new Date()
          yield* assertLoginAllowed(key, now)

          if (!recoveryTokenMatches(recoveryToken.trim(), configuredToken)) {
            yield* recordLoginFailure(key, now)
            return yield* new AuthError({ reason: "invalid_credentials" })
          }

          const rows = yield* db.select().from(users).where(eq(users.username, username))
          const user = rows[0]
          if (!user) {
            yield* recordLoginFailure(key, now)
            return yield* new AuthError({ reason: "invalid_credentials" })
          }

          const passwordHash = yield* crypto.hashPassword(newPassword)
          yield* db.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, user.id))

          yield* db
            .update(apiKeys)
            .set({ revokedAt: now })
            .where(and(eq(apiKeys.userId, user.id), isNull(apiKeys.revokedAt)))

          yield* clearLoginFailures(key)
        }),

      createApiKey: (userId, name) =>
        Effect.gen(function* () {
          const rawToken = yield* crypto.generateToken()
          const tokenHash = yield* crypto.hashToken(rawToken)

          const rows = yield* db
            .insert(apiKeys)
            .values({
              userId,
              kind: "api_key",
              name,
              tokenHash,
            })
            .returning({ id: apiKeys.id })

          return { id: rows[0].id, token: rawToken }
        }),

      revokeApiKey: (id) =>
        Effect.gen(function* () {
          yield* db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id))
        }),

      listApiKeys: (userId) =>
        Effect.gen(function* () {
          return yield* db
            .select({
              id: apiKeys.id,
              kind: apiKeys.kind,
              name: apiKeys.name,
              lastUsedAt: apiKeys.lastUsedAt,
              expiresAt: apiKeys.expiresAt,
              revokedAt: apiKeys.revokedAt,
              createdAt: apiKeys.createdAt,
            })
            .from(apiKeys)
            .where(eq(apiKeys.userId, userId))
            .orderBy(desc(apiKeys.createdAt))
        }),
    }
  }),
)
