import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { IndexerService, IndexerServiceLive } from './IndexerService'
import { CryptoServiceLive } from './CryptoService'
import { TestDbLive } from '#/effect/test/TestDb'

const TestLayer = IndexerServiceLive.pipe(
  Layer.provideMerge(CryptoServiceLive),
  Layer.provideMerge(TestDbLive),
)

const VALID_INPUT = {
  name: 'Test Indexer',
  type: 'torznab' as const,
  baseUrl: 'https://example.com',
  apiKey: 'secret-key-123',
}

describe('IndexerService', () => {
  it.effect('add returns indexer with id and no health', () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const indexer = yield* svc.add(VALID_INPUT)
      expect(typeof indexer.id).toBe('number')
      expect(indexer.name).toBe('Test Indexer')
      expect(indexer.type).toBe('torznab')
      expect(indexer.baseUrl).toBe('https://example.com')
      expect(indexer.enabled).toBe(true)
      expect(indexer.priority).toBe(50)
      expect(indexer.categories).toEqual([])
      expect(indexer.health).toBeNull()
    }).pipe(Effect.provide(TestLayer)))

  it.effect('add never exposes API key', () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const indexer = yield* svc.add(VALID_INPUT)
      const json = JSON.stringify(indexer)
      expect(json).not.toContain('secret-key-123')
      expect(json).not.toContain('apiKey')
      expect(json).not.toContain('apiKeyEncrypted')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('add respects custom priority + categories', () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const indexer = yield* svc.add({
        ...VALID_INPUT,
        priority: 10,
        categories: [2000, 5000],
      })
      expect(indexer.priority).toBe(10)
      expect(indexer.categories).toEqual([2000, 5000])
    }).pipe(Effect.provide(TestLayer)))

  it.effect('list returns all indexers ordered by priority', () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      yield* svc.add({ ...VALID_INPUT, name: 'Low Priority', priority: 90 })
      yield* svc.add({ ...VALID_INPUT, name: 'High Priority', priority: 1 })
      const all = yield* svc.list()
      expect(all).toHaveLength(2)
      expect(all[0].name).toBe('High Priority')
      expect(all[1].name).toBe('Low Priority')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('getById returns indexer', () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const added = yield* svc.add(VALID_INPUT)
      const found = yield* svc.getById(added.id)
      expect(found.id).toBe(added.id)
      expect(found.name).toBe('Test Indexer')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('getById with missing id fails with NotFoundError', () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const error = yield* Effect.flip(svc.getById(99999))
      expect(error._tag).toBe('NotFoundError')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('update modifies fields', () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const added = yield* svc.add(VALID_INPUT)
      const updated = yield* svc.update(added.id, {
        name: 'Renamed',
        enabled: false,
        priority: 5,
      })
      expect(updated.name).toBe('Renamed')
      expect(updated.enabled).toBe(false)
      expect(updated.priority).toBe(5)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('update with new API key re-encrypts', () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const added = yield* svc.add(VALID_INPUT)
      const updated = yield* svc.update(added.id, { apiKey: 'new-secret' })
      const json = JSON.stringify(updated)
      expect(json).not.toContain('new-secret')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('update with missing id fails with NotFoundError', () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const error = yield* Effect.flip(svc.update(99999, { name: 'Nope' }))
      expect(error._tag).toBe('NotFoundError')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('remove succeeds then getById fails', () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const added = yield* svc.add(VALID_INPUT)
      yield* svc.remove(added.id)
      const error = yield* Effect.flip(svc.getById(added.id))
      expect(error._tag).toBe('NotFoundError')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('remove with missing id fails with NotFoundError', () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const error = yield* Effect.flip(svc.remove(99999))
      expect(error._tag).toBe('NotFoundError')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('search returns empty when no indexers', () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      const result = yield* svc.search({ term: 'test', type: 'general' })
      expect(result.releases).toEqual([])
      expect(result.errors).toEqual([])
    }).pipe(Effect.provide(TestLayer)))

  it.effect('search skips disabled indexers', () =>
    Effect.gen(function* () {
      const svc = yield* IndexerService
      yield* svc.add({ ...VALID_INPUT, enabled: false })
      const result = yield* svc.search({ term: 'test', type: 'general' })
      // disabled indexer not contacted — no releases, no errors
      expect(result.releases).toEqual([])
      expect(result.errors).toEqual([])
    }).pipe(Effect.provide(TestLayer)))
})
