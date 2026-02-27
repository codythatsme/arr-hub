import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { MovieService, MovieServiceLive } from './MovieService'
import { TestDbLive } from '#/effect/test/TestDb'

const TestLayer = MovieServiceLive.pipe(Layer.provideMerge(TestDbLive))

describe('MovieService', () => {
  it.effect('add returns movie with generated id', () =>
    Effect.gen(function* () {
      const svc = yield* MovieService
      const movie = yield* svc.add({ tmdbId: 100, title: 'Test Movie' })
      expect(typeof movie.id).toBe('number')
      expect(movie.tmdbId).toBe(100)
      expect(movie.title).toBe('Test Movie')
      expect(movie.status).toBe('wanted')
      expect(movie.monitored).toBe(true)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('add with duplicate tmdbId fails with ConflictError', () =>
    Effect.gen(function* () {
      const svc = yield* MovieService
      yield* svc.add({ tmdbId: 200, title: 'First' })
      const error = yield* Effect.flip(svc.add({ tmdbId: 200, title: 'Duplicate' }))
      expect(error._tag).toBe('ConflictError')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('list returns all movies', () =>
    Effect.gen(function* () {
      const svc = yield* MovieService
      yield* svc.add({ tmdbId: 1, title: 'A' })
      yield* svc.add({ tmdbId: 2, title: 'B' })
      const all = yield* svc.list()
      expect(all).toHaveLength(2)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('list with status filter', () =>
    Effect.gen(function* () {
      const svc = yield* MovieService
      yield* svc.add({ tmdbId: 1, title: 'Wanted', status: 'wanted' })
      yield* svc.add({ tmdbId: 2, title: 'Available', status: 'available' })
      const wanted = yield* svc.list({ status: 'wanted' })
      expect(wanted).toHaveLength(1)
      expect(wanted[0].title).toBe('Wanted')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('list with monitored filter', () =>
    Effect.gen(function* () {
      const svc = yield* MovieService
      yield* svc.add({ tmdbId: 1, title: 'Monitored', monitored: true })
      yield* svc.add({ tmdbId: 2, title: 'Unmonitored', monitored: false })
      const monitored = yield* svc.list({ monitored: true })
      expect(monitored).toHaveLength(1)
      expect(monitored[0].title).toBe('Monitored')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('getById returns movie', () =>
    Effect.gen(function* () {
      const svc = yield* MovieService
      const added = yield* svc.add({ tmdbId: 42, title: 'Find Me' })
      const found = yield* svc.getById(added.id)
      expect(found.title).toBe('Find Me')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('getById with missing id fails with NotFoundError', () =>
    Effect.gen(function* () {
      const svc = yield* MovieService
      const error = yield* Effect.flip(svc.getById(99999))
      expect(error._tag).toBe('NotFoundError')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('update returns updated movie', () =>
    Effect.gen(function* () {
      const svc = yield* MovieService
      const added = yield* svc.add({ tmdbId: 50, title: 'Original' })
      const updated = yield* svc.update(added.id, { title: 'Updated' })
      expect(updated.title).toBe('Updated')
      expect(updated.id).toBe(added.id)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('update with missing id fails with NotFoundError', () =>
    Effect.gen(function* () {
      const svc = yield* MovieService
      const error = yield* Effect.flip(svc.update(99999, { title: 'Nope' }))
      expect(error._tag).toBe('NotFoundError')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('remove succeeds then getById fails', () =>
    Effect.gen(function* () {
      const svc = yield* MovieService
      const added = yield* svc.add({ tmdbId: 60, title: 'Delete Me' })
      yield* svc.remove(added.id)
      const error = yield* Effect.flip(svc.getById(added.id))
      expect(error._tag).toBe('NotFoundError')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('remove with missing id fails with NotFoundError', () =>
    Effect.gen(function* () {
      const svc = yield* MovieService
      const error = yield* Effect.flip(svc.remove(99999))
      expect(error._tag).toBe('NotFoundError')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('lookup matches title substring', () =>
    Effect.gen(function* () {
      const svc = yield* MovieService
      yield* svc.add({ tmdbId: 1, title: 'The Dark Knight' })
      yield* svc.add({ tmdbId: 2, title: 'Dark Waters' })
      yield* svc.add({ tmdbId: 3, title: 'Inception' })
      const results = yield* svc.lookup('Dark')
      expect(results).toHaveLength(2)
    }).pipe(Effect.provide(TestLayer)))
})
