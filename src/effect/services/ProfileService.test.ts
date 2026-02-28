import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { ProfileService, ProfileServiceLive } from './ProfileService'
import { MovieService, MovieServiceLive } from './MovieService'
import { TestDbLive } from '#/effect/test/TestDb'
import { customFormats } from '#/db/schema'
import { Db } from './Db'

const TestLayer = Layer.mergeAll(ProfileServiceLive, MovieServiceLive).pipe(
  Layer.provideMerge(TestDbLive),
)

describe('ProfileService', () => {
  it.effect('create returns profile with generated id', () =>
    Effect.gen(function* () {
      const svc = yield* ProfileService
      const result = yield* svc.create({ name: 'Test Profile' })
      expect(typeof result.profile.id).toBe('number')
      expect(result.profile.name).toBe('Test Profile')
      expect(result.profile.upgradeAllowed).toBe(false)
      expect(result.profile.isDefault).toBe(false)
      expect(result.qualityItems).toHaveLength(0)
      expect(result.formatScores).toHaveLength(0)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('create with duplicate name fails with ConflictError', () =>
    Effect.gen(function* () {
      const svc = yield* ProfileService
      yield* svc.create({ name: 'Dupe' })
      const error = yield* Effect.flip(svc.create({ name: 'Dupe' }))
      expect(error._tag).toBe('ConflictError')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('create with quality items persists them', () =>
    Effect.gen(function* () {
      const svc = yield* ProfileService
      const result = yield* svc.create({
        name: 'With Items',
        qualityItems: [
          { qualityName: null, groupName: 'WEB 1080p', weight: 1, allowed: true },
          { qualityName: 'WEBDL-1080p', groupName: 'WEB 1080p', weight: 2, allowed: true },
          { qualityName: 'WEBRip-1080p', groupName: 'WEB 1080p', weight: 3, allowed: true },
          { qualityName: 'Bluray-1080p', groupName: null, weight: 4, allowed: true },
        ],
      })
      expect(result.qualityItems).toHaveLength(4)
      // Group header
      const header = result.qualityItems.find((i) => i.qualityName === null)
      expect(header?.groupName).toBe('WEB 1080p')
      // Group children
      const children = result.qualityItems.filter((i) => i.groupName === 'WEB 1080p' && i.qualityName !== null)
      expect(children).toHaveLength(2)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('create with format scores persists them', () =>
    Effect.gen(function* () {
      const svc = yield* ProfileService
      const db = yield* Db
      // Create a custom format first
      const [fmt] = yield* db.insert(customFormats).values({ name: 'x264' }).returning()
      const result = yield* svc.create({
        name: 'With Scores',
        formatScores: [{ customFormatId: fmt.id, score: 50 }],
      })
      expect(result.formatScores).toHaveLength(1)
      expect(result.formatScores[0].score).toBe(50)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('list returns all profiles with details', () =>
    Effect.gen(function* () {
      const svc = yield* ProfileService
      yield* svc.create({ name: 'A' })
      yield* svc.create({ name: 'B' })
      const all = yield* svc.list()
      expect(all).toHaveLength(2)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('getById returns profile', () =>
    Effect.gen(function* () {
      const svc = yield* ProfileService
      const created = yield* svc.create({ name: 'Find Me' })
      const found = yield* svc.getById(created.profile.id)
      expect(found.profile.name).toBe('Find Me')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('getById with missing id fails with NotFoundError', () =>
    Effect.gen(function* () {
      const svc = yield* ProfileService
      const error = yield* Effect.flip(svc.getById(99999))
      expect(error._tag).toBe('NotFoundError')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('update changes profile fields', () =>
    Effect.gen(function* () {
      const svc = yield* ProfileService
      const created = yield* svc.create({ name: 'Original' })
      const updated = yield* svc.update(created.profile.id, {
        name: 'Updated',
        upgradeAllowed: true,
      })
      expect(updated.profile.name).toBe('Updated')
      expect(updated.profile.upgradeAllowed).toBe(true)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('update replaces quality items', () =>
    Effect.gen(function* () {
      const svc = yield* ProfileService
      const created = yield* svc.create({
        name: 'Items',
        qualityItems: [
          { qualityName: 'WEBDL-1080p', groupName: null, weight: 1, allowed: true },
        ],
      })
      expect(created.qualityItems).toHaveLength(1)

      const updated = yield* svc.update(created.profile.id, {
        qualityItems: [
          { qualityName: 'Bluray-1080p', groupName: null, weight: 1, allowed: true },
          { qualityName: 'Remux-1080p', groupName: null, weight: 2, allowed: true },
        ],
      })
      expect(updated.qualityItems).toHaveLength(2)
      expect(updated.qualityItems.some((i) => i.qualityName === 'Bluray-1080p')).toBe(true)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('update with missing id fails with NotFoundError', () =>
    Effect.gen(function* () {
      const svc = yield* ProfileService
      const error = yield* Effect.flip(svc.update(99999, { name: 'Nope' }))
      expect(error._tag).toBe('NotFoundError')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('isDefault toggling clears previous default', () =>
    Effect.gen(function* () {
      const svc = yield* ProfileService
      const a = yield* svc.create({ name: 'A', isDefault: true })
      expect(a.profile.isDefault).toBe(true)

      const b = yield* svc.create({ name: 'B', isDefault: true })
      expect(b.profile.isDefault).toBe(true)

      // A should no longer be default
      const aReloaded = yield* svc.getById(a.profile.id)
      expect(aReloaded.profile.isDefault).toBe(false)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('remove succeeds when not in use', () =>
    Effect.gen(function* () {
      const svc = yield* ProfileService
      const created = yield* svc.create({ name: 'Remove Me' })
      yield* svc.remove(created.profile.id)
      const error = yield* Effect.flip(svc.getById(created.profile.id))
      expect(error._tag).toBe('NotFoundError')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('remove fails with ProfileInUseError when movies reference profile', () =>
    Effect.gen(function* () {
      const profileSvc = yield* ProfileService
      const movieSvc = yield* MovieService
      const created = yield* profileSvc.create({ name: 'In Use' })
      yield* movieSvc.add({
        tmdbId: 999,
        title: 'Linked Movie',
        qualityProfileId: created.profile.id,
      })
      const error = yield* Effect.flip(profileSvc.remove(created.profile.id))
      expect(error._tag).toBe('ProfileInUseError')
      if (error._tag === 'ProfileInUseError') {
        expect(error.movieCount).toBe(1)
      }
    }).pipe(Effect.provide(TestLayer)))

  it.effect('remove with missing id fails with NotFoundError', () =>
    Effect.gen(function* () {
      const svc = yield* ProfileService
      const error = yield* Effect.flip(svc.remove(99999))
      expect(error._tag).toBe('NotFoundError')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('getDefault returns null when no default set', () =>
    Effect.gen(function* () {
      const svc = yield* ProfileService
      const result = yield* svc.getDefault()
      expect(result).toBeNull()
    }).pipe(Effect.provide(TestLayer)))

  it.effect('getDefault returns default profile', () =>
    Effect.gen(function* () {
      const svc = yield* ProfileService
      yield* svc.create({ name: 'Not Default' })
      yield* svc.create({ name: 'Default', isDefault: true })
      const result = yield* svc.getDefault()
      expect(result?.profile.name).toBe('Default')
    }).pipe(Effect.provide(TestLayer)))
})
