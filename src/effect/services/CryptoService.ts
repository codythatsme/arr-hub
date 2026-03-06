import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto"

import { Context, Effect, Layer } from "effect"

import { EncryptionError } from "../errors"

export class CryptoService extends Context.Tag("CryptoService")<
  CryptoService,
  {
    readonly hashPassword: (password: string) => Effect.Effect<string>
    readonly verifyPassword: (password: string, hash: string) => Effect.Effect<boolean>
    readonly generateToken: () => Effect.Effect<string>
    readonly hashToken: (token: string) => Effect.Effect<string>
    readonly encrypt: (plaintext: string) => Effect.Effect<string, EncryptionError>
    readonly decrypt: (ciphertext: string) => Effect.Effect<string, EncryptionError>
  }
>() {}

const SCRYPT_KEYLEN = 64
const SALT_LEN = 16
const IV_LEN = 12
const DEV_FALLBACK_KEY = "arr-hub-dev-key-do-not-use-in-prod"

let hasWarnedDevFallback = false

function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY is required in production")
    }

    // eslint-disable-next-line no-console -- startup warning, not in Effect context
    if (!hasWarnedDevFallback) {
      // eslint-disable-next-line no-console -- one-time startup warning for local development
      console.warn("[CryptoService] ENCRYPTION_KEY not set — using insecure dev fallback")
      hasWarnedDevFallback = true
    }
    return createHash("sha256").update(DEV_FALLBACK_KEY).digest()
  }
  return createHash("sha256").update(raw).digest()
}

export const CryptoServiceLive = Layer.succeed(CryptoService, {
  hashPassword: (password) =>
    Effect.sync(() => {
      const salt = randomBytes(SALT_LEN).toString("hex")
      const derived = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex")
      return `${salt}:${derived}`
    }),

  verifyPassword: (password, hash) =>
    Effect.sync(() => {
      const [salt, stored] = hash.split(":")
      const derived = scryptSync(password, salt, SCRYPT_KEYLEN)
      return timingSafeEqual(derived, Buffer.from(stored, "hex"))
    }),

  generateToken: () => Effect.sync(() => randomBytes(32).toString("hex")),

  hashToken: (token) => Effect.sync(() => createHash("sha256").update(token).digest("hex")),

  encrypt: (plaintext) =>
    Effect.try({
      try: () => {
        const key = getEncryptionKey()
        const iv = randomBytes(IV_LEN)
        const cipher = createCipheriv("aes-256-gcm", key, iv)
        const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
        const authTag = cipher.getAuthTag()
        return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`
      },
      catch: (e) =>
        new EncryptionError({ message: e instanceof Error ? e.message : "encryption failed" }),
    }),

  decrypt: (ciphertext) =>
    Effect.try({
      try: () => {
        const [ivHex, authTagHex, encryptedHex] = ciphertext.split(":")
        if (!ivHex || !authTagHex || !encryptedHex) {
          throw new Error("invalid ciphertext format")
        }
        const key = getEncryptionKey()
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"))
        decipher.setAuthTag(Buffer.from(authTagHex, "hex"))
        const decrypted = Buffer.concat([
          decipher.update(Buffer.from(encryptedHex, "hex")),
          decipher.final(),
        ])
        return decrypted.toString("utf8")
      },
      catch: (e) =>
        new EncryptionError({ message: e instanceof Error ? e.message : "decryption failed" }),
    }),
})
