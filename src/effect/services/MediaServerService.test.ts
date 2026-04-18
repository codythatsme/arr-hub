import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import { AdapterRegistryLive } from "#/effect/services/AdapterRegistry"
import { CryptoServiceLive } from "#/effect/services/CryptoService"
import { TestDbLive } from "#/effect/test/TestDb"

import { MediaServerService, MediaServerServiceLive } from "./MediaServerService"

const TestLayer = MediaServerServiceLive.pipe(
  Layer.provideMerge(CryptoServiceLive),
  Layer.provideMerge(AdapterRegistryLive),
  Layer.provideMerge(TestDbLive),
)

const validInput = {
  name: "My Plex",
  type: "plex" as const,
  host: "192.168.1.100",
  port: 32400,
  token: "abc123secret",
}

describe("MediaServerService", () => {
  it.effect("add returns server without token", () =>
    Effect.gen(function* () {
      const svc = yield* MediaServerService
      const server = yield* svc.add(validInput)
      expect(typeof server.id).toBe("number")
      expect(server.name).toBe("My Plex")
      expect(server.type).toBe("plex")
      expect(server.host).toBe("192.168.1.100")
      expect(server.port).toBe(32400)
      expect(server.useSsl).toBe(false)
      expect(server.enabled).toBe(true)
      expect(server.health).toBeNull()
      // token never exposed
      expect(JSON.stringify(server)).not.toContain("abc123secret")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("add with custom settings", () =>
    Effect.gen(function* () {
      const svc = yield* MediaServerService
      const server = yield* svc.add({
        ...validInput,
        useSsl: true,
        enabled: false,
        settings: { syncIntervalMs: 7200000, monitoringEnabled: false },
      })
      expect(server.useSsl).toBe(true)
      expect(server.enabled).toBe(false)
      expect(server.settings.syncIntervalMs).toBe(7200000)
      expect(server.settings.monitoringEnabled).toBe(false)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("list returns all servers ordered by name", () =>
    Effect.gen(function* () {
      const svc = yield* MediaServerService
      yield* svc.add({ ...validInput, name: "Zebra" })
      yield* svc.add({ ...validInput, name: "Alpha", host: "10.0.0.1" })
      const all = yield* svc.list()
      expect(all).toHaveLength(2)
      expect(all[0].name).toBe("Alpha")
      expect(all[1].name).toBe("Zebra")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("getById returns server", () =>
    Effect.gen(function* () {
      const svc = yield* MediaServerService
      const added = yield* svc.add(validInput)
      const found = yield* svc.getById(added.id)
      expect(found.name).toBe("My Plex")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("getById with missing id fails with NotFoundError", () =>
    Effect.gen(function* () {
      const svc = yield* MediaServerService
      const error = yield* Effect.flip(svc.getById(99999))
      expect(error._tag).toBe("NotFoundError")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("update returns updated server", () =>
    Effect.gen(function* () {
      const svc = yield* MediaServerService
      const added = yield* svc.add(validInput)
      const updated = yield* svc.update(added.id, { name: "Renamed" })
      expect(updated.name).toBe("Renamed")
      expect(updated.id).toBe(added.id)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("update token re-encrypts without exposing", () =>
    Effect.gen(function* () {
      const svc = yield* MediaServerService
      const added = yield* svc.add(validInput)
      const updated = yield* svc.update(added.id, { token: "newtoken456" })
      expect(JSON.stringify(updated)).not.toContain("newtoken456")
      expect(JSON.stringify(updated)).not.toContain("abc123secret")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("update with missing id fails with NotFoundError", () =>
    Effect.gen(function* () {
      const svc = yield* MediaServerService
      const error = yield* Effect.flip(svc.update(99999, { name: "Nope" }))
      expect(error._tag).toBe("NotFoundError")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("remove succeeds then getById fails", () =>
    Effect.gen(function* () {
      const svc = yield* MediaServerService
      const added = yield* svc.add(validInput)
      yield* svc.remove(added.id)
      const error = yield* Effect.flip(svc.getById(added.id))
      expect(error._tag).toBe("NotFoundError")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("remove with missing id fails with NotFoundError", () =>
    Effect.gen(function* () {
      const svc = yield* MediaServerService
      const error = yield* Effect.flip(svc.remove(99999))
      expect(error._tag).toBe("NotFoundError")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("list returns empty when no servers", () =>
    Effect.gen(function* () {
      const svc = yield* MediaServerService
      const all = yield* svc.list()
      expect(all).toHaveLength(0)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("token never appears in any response field", () =>
    Effect.gen(function* () {
      const svc = yield* MediaServerService
      const added = yield* svc.add(validInput)
      const listed = yield* svc.list()
      const fetched = yield* svc.getById(added.id)

      for (const result of [added, listed[0], fetched]) {
        const json = JSON.stringify(result)
        expect(json).not.toContain("abc123secret")
        expect(json).not.toContain("token")
      }
    }).pipe(Effect.provide(TestLayer)),
  )
})
