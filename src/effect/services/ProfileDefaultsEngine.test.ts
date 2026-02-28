import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { ProfileDefaultsEngine, ProfileDefaultsEngineLive } from './ProfileDefaultsEngine'
import { ProfileService, ProfileServiceLive } from './ProfileService'
import { ConfigServiceLive } from './ConfigService'
import { TestDbLive } from '#/effect/test/TestDb'
import { BUNDLE_LIST } from '#/effect/domain/bundles'

const TestLayer = ProfileDefaultsEngineLive.pipe(
  Layer.provideMerge(Layer.mergeAll(ProfileServiceLive, ConfigServiceLive)),
  Layer.provideMerge(TestDbLive),
)

describe('ProfileDefaultsEngine', () => {
  it.effect('listBundles returns all bundles', () =>
    Effect.gen(function* () {
      const engine = yield* ProfileDefaultsEngine
      const bundles = yield* engine.listBundles()
      expect(bundles).toHaveLength(2)
      expect(bundles[0].id).toBe('trash-hd-bluray-web-1080p')
      expect(bundles[1].id).toBe('trash-uhd-bluray-web-2160p')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('getBundle returns bundle by id', () =>
    Effect.gen(function* () {
      const engine = yield* ProfileDefaultsEngine
      const bundle = yield* engine.getBundle('trash-hd-bluray-web-1080p')
      expect(bundle.name).toBe('HD Bluray + WEB (1080p)')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('getBundle fails with BundleNotFoundError for unknown id', () =>
    Effect.gen(function* () {
      const engine = yield* ProfileDefaultsEngine
      const error = yield* Effect.flip(engine.getBundle('nonexistent'))
      expect(error._tag).toBe('BundleNotFoundError')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('applyBundle sets quality items and format scores on profile', () =>
    Effect.gen(function* () {
      const engine = yield* ProfileDefaultsEngine
      const profileSvc = yield* ProfileService
      const profile = yield* profileSvc.create({ name: 'Apply Target' })

      const result = yield* engine.applyBundle('trash-hd-bluray-web-1080p', profile.profile.id)
      expect(result.qualityItems.length).toBeGreaterThan(0)
      expect(result.formatScores.length).toBeGreaterThan(0)
      expect(result.profile.appliedBundleId).toBe('trash-hd-bluray-web-1080p')
      expect(result.profile.appliedBundleVersion).toBe(1)
      expect(result.profile.upgradeAllowed).toBe(true)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('applyBundle same version without force yields BundleVersionConflictError', () =>
    Effect.gen(function* () {
      const engine = yield* ProfileDefaultsEngine
      const profileSvc = yield* ProfileService
      const profile = yield* profileSvc.create({ name: 'Conflict Target' })

      yield* engine.applyBundle('trash-hd-bluray-web-1080p', profile.profile.id)
      const error = yield* Effect.flip(
        engine.applyBundle('trash-hd-bluray-web-1080p', profile.profile.id),
      )
      expect(error._tag).toBe('BundleVersionConflictError')
    }).pipe(Effect.provide(TestLayer)))

  it.effect('applyBundle with force succeeds even at same version', () =>
    Effect.gen(function* () {
      const engine = yield* ProfileDefaultsEngine
      const profileSvc = yield* ProfileService
      const profile = yield* profileSvc.create({ name: 'Force Target' })

      yield* engine.applyBundle('trash-hd-bluray-web-1080p', profile.profile.id)
      const result = yield* engine.applyBundle('trash-hd-bluray-web-1080p', profile.profile.id, {
        force: true,
      })
      expect(result.profile.appliedBundleVersion).toBe(1)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('previewEffective returns virtual profile without persisting', () =>
    Effect.gen(function* () {
      const engine = yield* ProfileDefaultsEngine
      const profileSvc = yield* ProfileService

      const preview = yield* engine.previewEffective('trash-hd-bluray-web-1080p')
      expect(preview.profile.id).toBe(0)
      expect(preview.profile.name).toBe('HD Bluray + WEB (1080p)')
      expect(preview.qualityItems.length).toBeGreaterThan(0)

      // Verify nothing was persisted
      const all = yield* profileSvc.list()
      expect(all).toHaveLength(0)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('previewEffective with overrides applies them', () =>
    Effect.gen(function* () {
      const engine = yield* ProfileDefaultsEngine
      const preview = yield* engine.previewEffective('trash-hd-bluray-web-1080p', {
        qualityItems: [
          { qualityName: 'Bluray-1080p', groupName: null, weight: 1, allowed: false },
        ],
      })
      expect(preview.qualityItems).toHaveLength(1)
      expect(preview.qualityItems[0].allowed).toBe(false)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('previewReapply returns simulated reapply result', () =>
    Effect.gen(function* () {
      const engine = yield* ProfileDefaultsEngine
      const profileSvc = yield* ProfileService
      const profile = yield* profileSvc.create({ name: 'Reapply Preview' })
      yield* engine.applyBundle('trash-hd-bluray-web-1080p', profile.profile.id)

      const preview = yield* engine.previewReapply(profile.profile.id, 'trash-hd-bluray-web-1080p')
      expect(preview.profile.appliedBundleId).toBe('trash-hd-bluray-web-1080p')
      expect(preview.qualityItems.length).toBeGreaterThan(0)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('seedDefaults creates default profile from first bundle', () =>
    Effect.gen(function* () {
      const engine = yield* ProfileDefaultsEngine
      const profileSvc = yield* ProfileService

      yield* engine.seedDefaults()

      const all = yield* profileSvc.list()
      expect(all).toHaveLength(1)
      expect(all[0].profile.name).toBe(BUNDLE_LIST[0].name)
      expect(all[0].profile.isDefault).toBe(true)
      expect(all[0].qualityItems.length).toBeGreaterThan(0)
      expect(all[0].formatScores.length).toBeGreaterThan(0)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('seedDefaults is idempotent', () =>
    Effect.gen(function* () {
      const engine = yield* ProfileDefaultsEngine
      const profileSvc = yield* ProfileService

      yield* engine.seedDefaults()
      yield* engine.seedDefaults()

      const all = yield* profileSvc.list()
      expect(all).toHaveLength(1)
    }).pipe(Effect.provide(TestLayer)))

  it.effect('bundles include negative scoring for rejected qualities', () =>
    Effect.gen(function* () {
      const engine = yield* ProfileDefaultsEngine
      const bundle = yield* engine.getBundle('trash-hd-bluray-web-1080p')
      const lq = bundle.formatScores.find((s) => s.formatName === 'LQ')
      expect(lq?.score).toBe(-10000)
      const brdisk = bundle.formatScores.find((s) => s.formatName === 'BR-DISK')
      expect(brdisk?.score).toBe(-10000)
    }).pipe(Effect.provide(TestLayer)))
})
