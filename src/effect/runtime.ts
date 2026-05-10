import { Effect, ManagedRuntime } from "effect"

import { users } from "#/db/schema"

import { resolveInitialAdminPassword } from "./bootstrap"
import { TmdbClientE2EFixtures } from "./fixtures/TmdbClientFixtures"
import { AppLive, makeAppLayer } from "./layers"
import { CryptoService } from "./services/CryptoService"
import { Db } from "./services/Db"
import { IndexerService } from "./services/IndexerService"
import { NotificationService } from "./services/NotificationService"
import { PlexSessionMonitor } from "./services/PlexSessionMonitor"
import { createSchedulerLoop } from "./services/SchedulerLoop"
import { SchedulerService } from "./services/SchedulerService"
import {
  formatStartupCheckError,
  runStartupChecks,
  shouldRunStartupChecks,
  StartupCheckError,
} from "./startupChecks"

const AppLayer =
  process.env.ARR_HUB_E2E_FIXTURES === "1" ? makeAppLayer(TmdbClientE2EFixtures) : AppLive

export const AppRuntime = ManagedRuntime.make(AppLayer)

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

  const indexers = yield* IndexerService
  yield* indexers.seedBuiltInDefinitions()

  const sessionMonitor = yield* PlexSessionMonitor
  yield* sessionMonitor.startAllEnabled()
})

const startup = shouldRunStartupChecks()
  ? runStartupChecks().then((result) => {
      for (const warning of result.warnings) {
        // eslint-disable-next-line no-console -- startup warning before Effect logger is available
        console.warn(`[arr-hub] startup warning: ${warning}`)
      }
    })
  : Promise.resolve()

function formatSeedError(error: unknown) {
  if (error instanceof StartupCheckError) return formatStartupCheckError(error)
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
  return `[arr-hub] seed failed\n${message}`
}

startup
  .then(() => AppRuntime.runPromise(seed))
  .then(
    () => {
      // Fork the scheduler loop — interrupted on AppRuntime.dispose()
      AppRuntime.runFork(
        createSchedulerLoop().pipe(
          Effect.catchAllDefect((d) => Effect.logError(`[scheduler] fatal defect: ${d}`)),
        ),
      )
      AppRuntime.runFork(
        Effect.gen(function* () {
          const notifications = yield* NotificationService
          yield* notifications.runWorker()
        }).pipe(
          Effect.catchAllDefect((d) => Effect.logError(`[notifications] fatal defect: ${d}`)),
        ),
      )
    },
    (err) => {
      // eslint-disable-next-line no-console -- startup error handler
      console.error(formatSeedError(err))
      process.exitCode = 1
    },
  )

process.on("beforeExit", () => {
  AppRuntime.dispose().then(
    () => {},
    // eslint-disable-next-line no-console -- shutdown error handler
    (err) => console.error("[arr-hub] runtime dispose failed:", err),
  )
})
