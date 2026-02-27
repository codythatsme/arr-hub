import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import { Context, Effect, Layer } from 'effect'

export class CryptoService extends Context.Tag('CryptoService')<
  CryptoService,
  {
    readonly hashPassword: (password: string) => Effect.Effect<string>
    readonly verifyPassword: (password: string, hash: string) => Effect.Effect<boolean>
    readonly generateToken: () => Effect.Effect<string>
    readonly hashToken: (token: string) => Effect.Effect<string>
  }
>() {}

const SCRYPT_KEYLEN = 64
const SALT_LEN = 16

export const CryptoServiceLive = Layer.succeed(CryptoService, {
  hashPassword: (password) =>
    Effect.sync(() => {
      const salt = randomBytes(SALT_LEN).toString('hex')
      const derived = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex')
      return `${salt}:${derived}`
    }),

  verifyPassword: (password, hash) =>
    Effect.sync(() => {
      const [salt, stored] = hash.split(':')
      const derived = scryptSync(password, salt, SCRYPT_KEYLEN)
      return timingSafeEqual(derived, Buffer.from(stored, 'hex'))
    }),

  generateToken: () =>
    Effect.sync(() => randomBytes(32).toString('hex')),

  hashToken: (token) =>
    Effect.sync(() => createHash('sha256').update(token).digest('hex')),
})
