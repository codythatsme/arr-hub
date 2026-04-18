import { Effect, ManagedRuntime } from "effect"

import { users } from "#/db/schema"

import { resolveInitialAdminPassword } from "./bootstrap"
import { AppLive } from "./layers"
import { CryptoService } from "./services/CryptoService"
import { Db } from "./services/Db"
import { PlexSessionMonitor } from "./services/PlexSessionMonitor"
import { createSchedulerLoop } from "./services/SchedulerLoop"
import { SchedulerService } from "./services/SchedulerService"

export const AppRuntime = ManagedRuntime.make(AppLive)

/**
 * Seed scheduler config + start background services.
 *
 * Admin user and quality profile defaults are no longer created here — onboarding
 * (OnboardingService) drives those on first launch. As an escape hatch, an admin is
 * still seeded iff INITIAL_ADMIN_PASSWORD is explicitly set (e.g. headless docker).
 */
const seed = Effect.gen(function* () {
  const db = yield* Db
  const crypto = yield* CryptoService

  const existing = yield* db.select({ id: users.id }).from(users).limit(1)
  if (existing.length === 0 && process.env.INITIAL_ADMIN_PASSWORD?.trim()) {
    const password = resolveInitialAdminPassword(process.env)
    const passwordHash = yield* crypto.hashPassword(password)

    yield* db.insert(users).values({
      username: "admin",
      passwordHash,
    })

    // eslint-disable-next-line no-console -- startup log
    console.log("[arr-hub] admin user seeded from INITIAL_ADMIN_PASSWORD")
  }

  const scheduler = yield* SchedulerService
  yield* scheduler.seedConfig()

  const sessionMonitor = yield* PlexSessionMonitor
  yield* sessionMonitor.startAllEnabled()
})

AppRuntime.runPromise(seed).then(
  () => {
    // Fork the scheduler loop — interrupted on AppRuntime.dispose()
    AppRuntime.runFork(
      createSchedulerLoop().pipe(
        Effect.catchAllDefect((d) => Effect.logError(`[scheduler] fatal defect: ${d}`)),
      ),
    )
  },
  (err) => {
    // eslint-disable-next-line no-console -- startup error handler
    console.error("[arr-hub] seed failed:", err)
  },
)

process.on("beforeExit", () => {
  AppRuntime.dispose().then(
    () => {},
    // eslint-disable-next-line no-console -- shutdown error handler
    (err) => console.error("[arr-hub] runtime dispose failed:", err),
  )
})
