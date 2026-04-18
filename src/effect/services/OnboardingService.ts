import { SqlError } from "@effect/sql/SqlError"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { rootFolders, setupLog, setupState, users } from "#/db/schema"

import {
  AuthError,
  ConflictError,
  NotFoundError,
  OnboardingError,
  ValidationError,
  type EncryptionError,
} from "../errors"
import { AuthService } from "./AuthService"
import { CryptoService } from "./CryptoService"
import { Db } from "./Db"
import { ProfileDefaultsEngine } from "./ProfileDefaultsEngine"

// ── Types ──

export type OnboardingPath = "quickstart" | "wizard"

export type WizardStep =
  | "admin"
  | "capabilities"
  | "profiles"
  | "root_folders"
  | "indexers"
  | "download_client"
  | "media_server"
  | "import"
  | "review"

export const WIZARD_STEP_ORDER: ReadonlyArray<WizardStep> = [
  "admin",
  "capabilities",
  "profiles",
  "root_folders",
  "indexers",
  "download_client",
  "media_server",
  "import",
  "review",
]

interface Capabilities {
  readonly movies: boolean
  readonly tv: boolean
}

export interface SetupStatus {
  readonly started: boolean
  readonly completed: boolean
  readonly hasAdmin: boolean
  readonly path: OnboardingPath | null
  readonly currentStep: string | null
  readonly completedSteps: ReadonlyArray<string>
  readonly capabilities: Capabilities
  readonly startedAt: Date | null
  readonly completedAt: Date | null
}

interface SessionResult {
  readonly token: string
  readonly expiresAt: Date
}

export interface QuickstartInput {
  readonly username: string
  readonly password: string
  readonly moviesRootFolder?: string
  readonly tvRootFolder?: string
}

export interface QuickstartResult {
  readonly session: SessionResult
}

export interface AdminStepResult {
  readonly session: SessionResult
}

export class OnboardingService extends Context.Tag("@arr-hub/OnboardingService")<
  OnboardingService,
  {
    readonly getStatus: () => Effect.Effect<SetupStatus, SqlError>

    readonly runQuickstart: (
      input: QuickstartInput,
    ) => Effect.Effect<
      QuickstartResult,
      OnboardingError | ValidationError | ConflictError | NotFoundError | EncryptionError | SqlError
    >

    readonly submitAdmin: (input: {
      readonly username: string
      readonly password: string
    }) => Effect.Effect<
      AdminStepResult,
      OnboardingError | AuthError | ValidationError | ConflictError | SqlError
    >

    readonly submitCapabilities: (
      input: Capabilities,
    ) => Effect.Effect<void, OnboardingError | SqlError>

    readonly submitProfiles: (input: {
      readonly bundleId: string
    }) => Effect.Effect<void, OnboardingError | NotFoundError | ConflictError | SqlError>

    readonly submitRootFolders: (input: {
      readonly movies?: string
      readonly tv?: string
    }) => Effect.Effect<void, OnboardingError | ValidationError | SqlError>

    readonly skipStep: (step: WizardStep) => Effect.Effect<void, OnboardingError | SqlError>

    readonly goBack: () => Effect.Effect<void, OnboardingError | SqlError>

    readonly complete: () => Effect.Effect<void, OnboardingError | SqlError>

    readonly startWizard: () => Effect.Effect<void, OnboardingError | SqlError>
  }
>() {}

// ── Helpers ──

const SINGLETON_ID = 1

export const OnboardingServiceLive = Layer.effect(
  OnboardingService,
  Effect.gen(function* () {
    const db = yield* Db
    const crypto = yield* CryptoService
    const auth = yield* AuthService
    const profileDefaults = yield* ProfileDefaultsEngine

    const loadState = () =>
      Effect.gen(function* () {
        const rows = yield* db.select().from(setupState).where(eq(setupState.id, SINGLETON_ID))
        return rows[0] ?? null
      })

    const ensureStateRow = (path: OnboardingPath, currentStep: WizardStep | null) =>
      Effect.gen(function* () {
        const existing = yield* loadState()
        if (existing) return existing
        const rows = yield* db
          .insert(setupState)
          .values({
            id: SINGLETON_ID,
            path,
            currentStep: currentStep ?? null,
          })
          .returning()
        return rows[0]
      })

    const assertNotComplete = () =>
      Effect.gen(function* () {
        const state = yield* loadState()
        if (state?.completedAt) {
          return yield* new OnboardingError({
            reason: "already_complete",
            message: "setup already completed",
          })
        }
      })

    const hasAnyAdmin = () =>
      Effect.gen(function* () {
        const rows = yield* db.select({ id: users.id }).from(users).limit(1)
        return rows.length > 0
      })

    const recordLog = (
      stepName: string,
      action: string,
      result: "success" | "failure" | "skipped",
      opts?: { readonly message?: string; readonly reversible?: boolean },
    ) =>
      db.insert(setupLog).values({
        stepName,
        action,
        result,
        message: opts?.message ?? null,
        reversible: opts?.reversible ?? false,
      })

    const markStepCompleted = (step: WizardStep, nextStep: WizardStep | null) =>
      Effect.gen(function* () {
        const state = yield* loadState()
        if (!state) return
        const completed = state.completedSteps.includes(step)
          ? state.completedSteps
          : [...state.completedSteps, step]
        yield* db
          .update(setupState)
          .set({ completedSteps: completed, currentStep: nextStep })
          .where(eq(setupState.id, SINGLETON_ID))
      })

    const nextStepAfter = (step: WizardStep): WizardStep | null => {
      const idx = WIZARD_STEP_ORDER.indexOf(step)
      if (idx < 0 || idx >= WIZARD_STEP_ORDER.length - 1) return null
      return WIZARD_STEP_ORDER[idx + 1]
    }

    const prevStepOf = (step: WizardStep): WizardStep | null => {
      const idx = WIZARD_STEP_ORDER.indexOf(step)
      if (idx <= 0) return null
      return WIZARD_STEP_ORDER[idx - 1]
    }

    const addRootFolderIfMissing = (
      path: string,
    ): Effect.Effect<void, ValidationError | SqlError> =>
      Effect.gen(function* () {
        const trimmed = path.replace(/\/+$/, "")
        if (trimmed.length === 0) {
          return yield* new ValidationError({ message: "root folder path cannot be empty" })
        }
        const existing = yield* db
          .select({ id: rootFolders.id })
          .from(rootFolders)
          .where(eq(rootFolders.path, trimmed))
        if (existing.length > 0) return
        yield* db.insert(rootFolders).values({ path: trimmed })
      })

    // ── Public API ──

    const getStatus = () =>
      Effect.gen(function* () {
        const state = yield* loadState()
        const hasAdmin = yield* hasAnyAdmin()
        if (!state) {
          return {
            started: false,
            completed: false,
            hasAdmin,
            path: null,
            currentStep: null,
            completedSteps: [],
            capabilities: { movies: true, tv: true },
            startedAt: null,
            completedAt: null,
          } satisfies SetupStatus
        }
        return {
          started: true,
          completed: state.completedAt !== null,
          hasAdmin,
          path: state.path,
          currentStep: state.currentStep,
          completedSteps: state.completedSteps,
          capabilities: state.capabilities,
          startedAt: state.startedAt,
          completedAt: state.completedAt,
        } satisfies SetupStatus
      })

    const runQuickstart = (input: QuickstartInput) =>
      Effect.gen(function* () {
        yield* assertNotComplete()

        // Create admin (or reject if exists)
        const adminExists = yield* hasAnyAdmin()
        if (adminExists) {
          return yield* new OnboardingError({
            reason: "admin_already_exists",
            message: "admin user already exists",
          })
        }
        if (input.username.trim().length === 0) {
          return yield* new ValidationError({ message: "username required" })
        }
        if (input.password.length < 8) {
          return yield* new ValidationError({ message: "password must be at least 8 characters" })
        }

        const passwordHash = yield* crypto.hashPassword(input.password)
        yield* db.insert(users).values({
          username: input.username,
          passwordHash,
        })

        yield* ensureStateRow("quickstart", null)
        yield* recordLog("admin", "create_user", "success", { reversible: false })

        // Seed defaults + apply first bundle (ProfileDefaultsEngine.seedDefaults is idempotent)
        yield* profileDefaults.seedDefaults()
        yield* recordLog("profiles", "seed_defaults", "success")

        // Optional root folders
        if (input.moviesRootFolder) {
          yield* addRootFolderIfMissing(input.moviesRootFolder)
          yield* recordLog("root_folders", `add:${input.moviesRootFolder}`, "success")
        }
        if (input.tvRootFolder) {
          yield* addRootFolderIfMissing(input.tvRootFolder)
          yield* recordLog("root_folders", `add:${input.tvRootFolder}`, "success")
        }

        // Mark complete
        yield* db
          .update(setupState)
          .set({
            completedSteps: [
              "admin",
              "capabilities",
              "profiles",
              "root_folders",
              "indexers",
              "download_client",
              "media_server",
              "import",
              "review",
            ],
            completedAt: new Date(),
          })
          .where(eq(setupState.id, SINGLETON_ID))
        yield* recordLog("review", "complete", "success")

        // Auto-login
        const session = yield* auth.login(input.username, input.password).pipe(
          Effect.catchTag("AuthError", (e) =>
            // Should never happen — we just created the user.
            Effect.fail(
              new OnboardingError({
                reason: "invalid_step",
                message: `auto-login failed: ${e.reason}`,
              }),
            ),
          ),
        )

        return { session }
      })

    const startWizard = () =>
      Effect.gen(function* () {
        yield* assertNotComplete()
        const existing = yield* loadState()
        if (existing) return
        yield* db.insert(setupState).values({
          id: SINGLETON_ID,
          path: "wizard",
          currentStep: "admin",
        })
      })

    const submitAdmin = (input: { readonly username: string; readonly password: string }) =>
      Effect.gen(function* () {
        yield* assertNotComplete()

        const adminExists = yield* hasAnyAdmin()
        if (adminExists) {
          return yield* new OnboardingError({
            reason: "admin_already_exists",
            message: "admin user already exists",
          })
        }

        if (input.username.trim().length === 0) {
          return yield* new ValidationError({ message: "username required" })
        }
        if (input.password.length < 8) {
          return yield* new ValidationError({ message: "password must be at least 8 characters" })
        }

        const passwordHash = yield* crypto.hashPassword(input.password)
        yield* db.insert(users).values({ username: input.username, passwordHash })

        yield* ensureStateRow("wizard", "admin")
        yield* markStepCompleted("admin", nextStepAfter("admin"))
        yield* recordLog("admin", "create_user", "success", { reversible: false })

        const session = yield* auth.login(input.username, input.password)
        return { session }
      })

    const submitCapabilities = (input: Capabilities) =>
      Effect.gen(function* () {
        yield* assertNotComplete()
        yield* ensureStateRow("wizard", "capabilities")
        yield* db
          .update(setupState)
          .set({ capabilities: input })
          .where(eq(setupState.id, SINGLETON_ID))
        yield* markStepCompleted("capabilities", nextStepAfter("capabilities"))
        yield* recordLog("capabilities", JSON.stringify(input), "success", { reversible: true })
      })

    const submitProfiles = (input: { readonly bundleId: string }) =>
      Effect.gen(function* () {
        yield* assertNotComplete()
        // seedDefaults is idempotent — safe to call. (Ignores bundle override for v1; schema supports later.)
        yield* profileDefaults.seedDefaults()
        yield* markStepCompleted("profiles", nextStepAfter("profiles"))
        yield* recordLog("profiles", `apply:${input.bundleId}`, "success", { reversible: false })
      })

    const submitRootFolders = (input: { readonly movies?: string; readonly tv?: string }) =>
      Effect.gen(function* () {
        yield* assertNotComplete()
        if (input.movies) {
          yield* addRootFolderIfMissing(input.movies)
          yield* recordLog("root_folders", `add:${input.movies}`, "success", { reversible: true })
        }
        if (input.tv) {
          yield* addRootFolderIfMissing(input.tv)
          yield* recordLog("root_folders", `add:${input.tv}`, "success", { reversible: true })
        }
        yield* markStepCompleted("root_folders", nextStepAfter("root_folders"))
      })

    const skipStep = (step: WizardStep) =>
      Effect.gen(function* () {
        yield* assertNotComplete()
        yield* markStepCompleted(step, nextStepAfter(step))
        yield* recordLog(step, "skip", "skipped")
      })

    const goBack = () =>
      Effect.gen(function* () {
        yield* assertNotComplete()
        const state = yield* loadState()
        if (!state?.currentStep) {
          return yield* new OnboardingError({
            reason: "not_started",
            message: "wizard has not started",
          })
        }
        const current = state.currentStep as WizardStep
        const prev = prevStepOf(current)
        if (!prev) {
          return yield* new OnboardingError({
            reason: "step_out_of_order",
            message: "already at first step",
          })
        }
        // Remove current from completedSteps so it can be re-submitted, set cursor to prev
        const nextCompleted = state.completedSteps.filter((s) => s !== prev && s !== current)
        yield* db
          .update(setupState)
          .set({ completedSteps: nextCompleted, currentStep: prev })
          .where(eq(setupState.id, SINGLETON_ID))
      })

    const complete = () =>
      Effect.gen(function* () {
        const state = yield* loadState()
        if (!state) {
          return yield* new OnboardingError({
            reason: "not_started",
            message: "setup has not started",
          })
        }
        if (state.completedAt) {
          return yield* new OnboardingError({
            reason: "already_complete",
            message: "setup already completed",
          })
        }
        const adminExists = yield* hasAnyAdmin()
        if (!adminExists) {
          return yield* new OnboardingError({
            reason: "step_out_of_order",
            message: "admin must be created before completing setup",
          })
        }
        yield* db
          .update(setupState)
          .set({ completedAt: new Date(), currentStep: null })
          .where(eq(setupState.id, SINGLETON_ID))
        yield* recordLog("review", "complete", "success")
      })

    return {
      getStatus,
      runQuickstart,
      submitAdmin,
      submitCapabilities,
      submitProfiles,
      submitRootFolders,
      skipStep,
      goBack,
      complete,
      startWizard,
    }
  }),
)
