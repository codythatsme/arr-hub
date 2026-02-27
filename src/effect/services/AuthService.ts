import { Context, Effect, Layer } from 'effect'
import { SqlError } from '@effect/sql/SqlError'
import { eq, and, isNull } from 'drizzle-orm'
import { users, apiKeys } from '#/db/schema'
import { Db } from './Db'
import { CryptoService } from './CryptoService'
import { AuthError } from '../errors'

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
  readonly kind: 'session' | 'api_key'
}

export class AuthService extends Context.Tag('AuthService')<
  AuthService,
  {
    readonly login: (username: string, password: string) => Effect.Effect<SessionResult, AuthError | SqlError>
    readonly validateToken: (token: string) => Effect.Effect<ValidatedUser, AuthError | SqlError>
    readonly createApiKey: (userId: number, name: string) => Effect.Effect<ApiKeyResult, SqlError>
    readonly revokeApiKey: (id: number) => Effect.Effect<void, SqlError>
  }
>() {}

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000

export const AuthServiceLive = Layer.effect(
  AuthService,
  Effect.gen(function* () {
    const db = yield* Db
    const crypto = yield* CryptoService

    return {
      login: (username, password) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(users)
            .where(eq(users.username, username))

          const user = rows[0]
          if (!user) {
            return yield* new AuthError({ reason: 'invalid_credentials' })
          }

          const valid = yield* crypto.verifyPassword(password, user.passwordHash)
          if (!valid) {
            return yield* new AuthError({ reason: 'invalid_credentials' })
          }

          const rawToken = yield* crypto.generateToken()
          const tokenHash = yield* crypto.hashToken(rawToken)
          const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)

          yield* db.insert(apiKeys).values({
            userId: user.id,
            kind: 'session',
            name: 'session',
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
            .where(
              and(
                eq(apiKeys.tokenHash, tokenHash),
                isNull(apiKeys.revokedAt),
              ),
            )

          const key = rows[0]
          if (!key) {
            return yield* new AuthError({ reason: 'missing' })
          }

          if (key.expiresAt && key.expiresAt < new Date()) {
            return yield* new AuthError({ reason: 'expired' })
          }

          yield* db
            .update(apiKeys)
            .set({ lastUsedAt: new Date() })
            .where(eq(apiKeys.id, key.id))

          return { userId: key.userId, keyId: key.id, kind: key.kind }
        }),

      createApiKey: (userId, name) =>
        Effect.gen(function* () {
          const rawToken = yield* crypto.generateToken()
          const tokenHash = yield* crypto.hashToken(rawToken)

          const rows = yield* db
            .insert(apiKeys)
            .values({
              userId,
              kind: 'api_key',
              name,
              tokenHash,
            })
            .returning({ id: apiKeys.id })

          return { id: rows[0].id, token: rawToken }
        }),

      revokeApiKey: (id) =>
        Effect.gen(function* () {
          yield* db
            .update(apiKeys)
            .set({ revokedAt: new Date() })
            .where(eq(apiKeys.id, id))
        }),
    }
  }),
)
