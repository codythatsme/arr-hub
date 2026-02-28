import { Effect, ManagedRuntime } from 'effect'
import { AppLive } from './layers'
import { Db } from './services/Db'
import { CryptoService } from './services/CryptoService'
import { ProfileDefaultsEngine } from './services/ProfileDefaultsEngine'
import { users } from '#/db/schema'

export const AppRuntime = ManagedRuntime.make(AppLive)

/** Seed admin user + default quality profile if tables are empty. */
const seed = Effect.gen(function* () {
  const db = yield* Db
  const crypto = yield* CryptoService

  const existing = yield* db.select({ id: users.id }).from(users).limit(1)
  if (existing.length === 0) {
    const password = process.env.INITIAL_ADMIN_PASSWORD ?? 'admin'
    const passwordHash = yield* crypto.hashPassword(password)

    yield* db.insert(users).values({
      username: 'admin',
      passwordHash,
    })

    console.log('[arr-hub] admin user seeded')
  }

  const engine = yield* ProfileDefaultsEngine
  yield* engine.seedDefaults()
})

AppRuntime.runPromise(seed).catch((err) => {
  console.error('[arr-hub] seed failed:', err)
})

process.on('beforeExit', () => {
  AppRuntime.dispose().then(
    () => {},
    (err) => console.error('[arr-hub] runtime dispose failed:', err),
  )
})
