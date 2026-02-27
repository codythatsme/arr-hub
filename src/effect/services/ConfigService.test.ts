import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { ConfigService, ConfigServiceLive } from './ConfigService'
import { TestDbLive } from '#/effect/test/TestDb'

const TestLayer = ConfigServiceLive.pipe(Layer.provideMerge(TestDbLive))

describe('ConfigService', () => {
  it.effect('get returns null for missing key', () =>
    Effect.gen(function* () {
      const config = yield* ConfigService
      const value = yield* config.get('nonexistent')
      expect(value).toBe(null)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('set + get round-trip', () =>
    Effect.gen(function* () {
      const config = yield* ConfigService
      yield* config.set('test-key', 'test-value')
      const value = yield* config.get('test-key')
      expect(value).toBe('test-value')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('set upserts existing key', () =>
    Effect.gen(function* () {
      const config = yield* ConfigService
      yield* config.set('key', 'original')
      yield* config.set('key', 'updated')
      const value = yield* config.get('key')
      expect(value).toBe('updated')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('getRequired returns value for existing key', () =>
    Effect.gen(function* () {
      const config = yield* ConfigService
      yield* config.set('exists', 'hello')
      const value = yield* config.getRequired('exists')
      expect(value).toBe('hello')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('getRequired fails with NotFoundError for missing key', () =>
    Effect.gen(function* () {
      const config = yield* ConfigService
      const error = yield* Effect.flip(config.getRequired('missing'))
      expect(error._tag).toBe('NotFoundError')
    }).pipe(Effect.provide(TestLayer)))
})
