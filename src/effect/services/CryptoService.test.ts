import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"

import { CryptoService, CryptoServiceLive } from "./CryptoService"

const TestLayer = CryptoServiceLive

describe("CryptoService", () => {
  it.effect("hash + verify password round-trip", () =>
    Effect.gen(function* () {
      const crypto = yield* CryptoService
      const hash = yield* crypto.hashPassword("mypassword")
      const valid = yield* crypto.verifyPassword("mypassword", hash)
      expect(valid).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("verify rejects wrong password", () =>
    Effect.gen(function* () {
      const crypto = yield* CryptoService
      const hash = yield* crypto.hashPassword("correct")
      const valid = yield* crypto.verifyPassword("wrong", hash)
      expect(valid).toBe(false)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("generateToken returns 64-char hex", () =>
    Effect.gen(function* () {
      const crypto = yield* CryptoService
      const token = yield* crypto.generateToken()
      expect(token).toHaveLength(64)
      expect(token).toMatch(/^[0-9a-f]{64}$/)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("hashToken is deterministic", () =>
    Effect.gen(function* () {
      const crypto = yield* CryptoService
      const a = yield* crypto.hashToken("same-input")
      const b = yield* crypto.hashToken("same-input")
      expect(a).toBe(b)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("hashToken differs for different inputs", () =>
    Effect.gen(function* () {
      const crypto = yield* CryptoService
      const a = yield* crypto.hashToken("input-a")
      const b = yield* crypto.hashToken("input-b")
      expect(a).not.toBe(b)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("verify fails with correct password against different hash", () =>
    Effect.gen(function* () {
      const crypto = yield* CryptoService
      const _hash1 = yield* crypto.hashPassword("password1")
      const hash2 = yield* crypto.hashPassword("password2")
      const valid = yield* crypto.verifyPassword("password1", hash2)
      expect(valid).toBe(false)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('encrypt + decrypt round-trip', () =>
    Effect.gen(function* () {
      const crypto = yield* CryptoService
      const plaintext = 'my-secret-api-key'
      const encrypted = yield* crypto.encrypt(plaintext)
      const decrypted = yield* crypto.decrypt(encrypted)
      expect(decrypted).toBe(plaintext)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('encrypt produces iv:authTag:ciphertext format', () =>
    Effect.gen(function* () {
      const crypto = yield* CryptoService
      const encrypted = yield* crypto.encrypt('test')
      const parts = encrypted.split(':')
      expect(parts).toHaveLength(3)
      expect(parts[0]).toMatch(/^[0-9a-f]+$/)
      expect(parts[1]).toMatch(/^[0-9a-f]+$/)
      expect(parts[2]).toMatch(/^[0-9a-f]+$/)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('encrypt produces unique ciphertexts (different IVs)', () =>
    Effect.gen(function* () {
      const crypto = yield* CryptoService
      const a = yield* crypto.encrypt('same-input')
      const b = yield* crypto.encrypt('same-input')
      expect(a).not.toBe(b)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('decrypt rejects malformed ciphertext', () =>
    Effect.gen(function* () {
      const crypto = yield* CryptoService
      const error = yield* Effect.flip(crypto.decrypt('not-valid'))
      expect(error._tag).toBe('EncryptionError')
    }).pipe(Effect.provide(TestLayer)))
})
