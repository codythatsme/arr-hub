import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { schedulerJobs, users } from "#/db/schema"
import { AppRuntime } from "#/effect/runtime"
import { AuthService } from "#/effect/services/AuthService"
import { CryptoService } from "#/effect/services/CryptoService"
import { Db } from "#/effect/services/Db"
import { SchedulerService } from "#/effect/services/SchedulerService"

import { trpcRouter } from "./router"

async function createAuthedCaller() {
  const token = await AppRuntime.runPromise(
    Effect.gen(function* () {
      const db = yield* Db
      const crypto = yield* CryptoService
      const auth = yield* AuthService

      const username = `router-test-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const password = "pass123"
      const passwordHash = yield* crypto.hashPassword(password)

      const inserted = yield* db
        .insert(users)
        .values({ username, passwordHash })
        .returning({ id: users.id })

      const session = yield* auth.login(username, password)
      return { userId: inserted[0].id, token: session.token }
    }),
  )

  const headers = new Headers()
  headers.set("authorization", `Bearer ${token.token}`)

  return {
    userId: token.userId,
    caller: trpcRouter.createCaller({ headers, userId: null }),
  }
}

describe("tRPC router integration", () => {
  it("supports api key listing/create/revoke via auth router", async () => {
    const { caller } = await createAuthedCaller()

    const created = await caller.auth.createApiKey({ name: "integration-key" })
    expect(created.id).toBeTypeOf("number")
    expect(created.token).toHaveLength(64)

    const listed = await caller.auth.listApiKeys()
    const createdKey = listed.find((k) => k.id === created.id)
    expect(createdKey?.name).toBe("integration-key")
    expect(createdKey?.kind).toBe("api_key")

    await caller.auth.revokeApiKey({ id: created.id })

    const listedAfter = await caller.auth.listApiKeys()
    const revoked = listedAfter.find((k) => k.id === created.id)
    expect(revoked?.revokedAt).not.toBeNull()
  })

  it("supports scheduler global pause/resume and retryJob", async () => {
    const { caller } = await createAuthedCaller()

    await AppRuntime.runPromise(
      Effect.gen(function* () {
        const scheduler = yield* SchedulerService
        yield* scheduler.seedConfig()
      }),
    )

    await caller.scheduler.pauseAll()
    const pausedConfig = await caller.scheduler.config()
    expect(pausedConfig.every((c) => c.enabled === false)).toBe(true)

    await caller.scheduler.resumeAll()
    const resumedConfig = await caller.scheduler.config()
    expect(resumedConfig.every((c) => c.enabled === true)).toBe(true)

    const deadJobId = await AppRuntime.runPromise(
      Effect.gen(function* () {
        const db = yield* Db
        const dedupe = `integration-dead-job-${Date.now()}-${Math.random().toString(16).slice(2)}`
        const rows = yield* db
          .insert(schedulerJobs)
          .values({
            jobType: "rss_sync",
            status: "dead",
            dedupeKey: dedupe,
            payload: { _tag: "rss_sync" },
            attempts: 4,
            maxAttempts: 4,
            errorMessage: "simulated failure",
            completedAt: new Date(),
          })
          .returning({ id: schedulerJobs.id })
        return rows[0].id
      }),
    )

    const retried = await caller.scheduler.retryJob({ id: deadJobId })
    expect(retried.id).toBe(deadJobId)
    expect(retried.status).toBe("pending")
    expect(retried.attempts).toBe(0)
    expect(retried.errorMessage).toBeNull()
  })
})
