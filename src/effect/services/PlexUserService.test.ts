import { SqlClient } from "@effect/sql"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Ref } from "effect"

import type {
  MediaServerAdapterMetadata,
  MediaServerSession,
  MediaServerSharedUser,
} from "#/effect/domain/mediaServer"
import { AdapterRegistry, AdapterRegistryLive } from "#/effect/services/AdapterRegistry"
import { CryptoService, CryptoServiceLive } from "#/effect/services/CryptoService"
import type { MediaServerAdapter } from "#/effect/services/MediaServerAdapter"
import {
  SessionHistoryService,
  SessionHistoryServiceLive,
} from "#/effect/services/SessionHistoryService"
import { TestDbLive } from "#/effect/test/TestDb"

import { PlexUserService, PlexUserServiceLive } from "./PlexUserService"

const TestLayer = PlexUserServiceLive.pipe(
  Layer.provideMerge(SessionHistoryServiceLive),
  Layer.provideMerge(CryptoServiceLive),
  Layer.provideMerge(AdapterRegistryLive),
  Layer.provideMerge(TestDbLive),
)

const seedMediaServer = Effect.gen(function* () {
  const crypto = yield* CryptoService
  const token = yield* crypto.encrypt("tok")
  const sql = yield* SqlClient.SqlClient
  yield* sql`INSERT INTO media_servers (name, type, host, port, token_encrypted) VALUES ('mock', 'mock-plex', '127.0.0.1', 32400, ${token})`
  return 1
})

const mockMetadata: MediaServerAdapterMetadata = {
  displayName: "Mock",
  defaultPort: 32400,
  authModel: "token",
}

const mockAdapter = (
  usersRef: Ref.Ref<ReadonlyArray<MediaServerSharedUser>>,
): MediaServerAdapter => ({
  testConnection: () => Effect.die("not used"),
  getLibraries: () => Effect.succeed([]),
  syncLibrary: () => Effect.succeed([]),
  refreshLibrary: () => Effect.void,
  getHealth: () => Effect.die("not used"),
  getActiveSessions: () => Effect.succeed([]),
  getSharedUsers: () => Ref.get(usersRef),
})

const registerMock = (usersRef: Ref.Ref<ReadonlyArray<MediaServerSharedUser>>) =>
  Effect.gen(function* () {
    const registry = yield* AdapterRegistry
    registry.registerMediaServer("mock-plex", mockMetadata, () => mockAdapter(usersRef))
  })

const baseSession = (overrides: Partial<MediaServerSession> = {}): MediaServerSession => ({
  mediaServerId: 1,
  sessionKey: "sk-1",
  ratingKey: "rk-1",
  userId: "42",
  username: "alice",
  userThumb: null,
  state: "playing",
  mediaType: "movie",
  title: "The Movie",
  parentTitle: null,
  grandparentTitle: null,
  year: 2024,
  thumb: null,
  viewOffset: 120_000,
  duration: 200_000,
  progressPercent: 60,
  transcodeDecision: "direct_play",
  videoResolution: "1080",
  audioCodec: "aac",
  player: "PlexWeb",
  platform: "Chrome",
  product: "Plex Web",
  ipAddress: "10.0.0.1",
  bandwidth: 5000,
  isLocal: true,
  startedAt: new Date(1_700_000_000_000),
  updatedAt: new Date(1_700_000_060_000),
  tmdbId: null,
  tvdbId: null,
  ...overrides,
})

describe("PlexUserService", () => {
  it.effect("syncUsers inserts new users and marks missing ones inactive", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      const usersRef = yield* Ref.make<ReadonlyArray<MediaServerSharedUser>>([
        {
          plexUserId: "1",
          username: "owner",
          friendlyName: "owner",
          email: null,
          thumb: null,
          isAdmin: true,
        },
        {
          plexUserId: "42",
          username: "alice",
          friendlyName: "alice",
          email: null,
          thumb: null,
          isAdmin: false,
        },
      ])
      yield* registerMock(usersRef)
      const svc = yield* PlexUserService

      const first = yield* svc.syncUsers(1)
      expect(first.added).toBe(2)
      expect(first.updated).toBe(0)
      expect(first.deactivated).toBe(0)

      const listed = yield* svc.listUsers(1)
      expect(listed).toHaveLength(2)
      expect(listed.find((u) => u.plexUserId === "1")?.isAdmin).toBe(true)

      // Second sync — same users, different friendly names + alice removed
      yield* Ref.set(usersRef, [
        {
          plexUserId: "1",
          username: "owner",
          friendlyName: "Owner Renamed",
          email: "o@example.com",
          thumb: "http://thumb",
          isAdmin: true,
        },
      ])
      const second = yield* svc.syncUsers(1)
      expect(second.added).toBe(0)
      expect(second.updated).toBe(1)
      expect(second.deactivated).toBe(1)

      const afterSecond = yield* svc.listUsers(1)
      const alice = afterSecond.find((u) => u.plexUserId === "42")
      expect(alice?.isActive).toBe(false)
      const owner = afterSecond.find((u) => u.plexUserId === "1")
      expect(owner?.friendlyName).toBe("Owner Renamed")
      expect(owner?.email).toBe("o@example.com")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("getUserStats aggregates from session_history", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      const usersRef = yield* Ref.make<ReadonlyArray<MediaServerSharedUser>>([
        {
          plexUserId: "42",
          username: "alice",
          friendlyName: "alice",
          email: null,
          thumb: null,
          isAdmin: false,
        },
      ])
      yield* registerMock(usersRef)
      const svc = yield* PlexUserService
      yield* svc.syncUsers(1)

      const history = yield* SessionHistoryService
      yield* history.writeHistory([
        baseSession({
          sessionKey: "a",
          title: "Movie A",
          viewOffset: 60_000,
          duration: 100_000,
        }),
        baseSession({
          sessionKey: "b",
          title: "Movie B",
          viewOffset: 30_000,
          duration: 100_000,
        }),
        baseSession({
          sessionKey: "c",
          mediaType: "episode",
          title: "S01E01",
          grandparentTitle: "Show X",
          viewOffset: 45_000,
          duration: 100_000,
        }),
        baseSession({
          sessionKey: "d",
          mediaType: "episode",
          title: "S01E02",
          grandparentTitle: "Show X",
          viewOffset: 45_000,
          duration: 100_000,
        }),
      ])

      const stats = yield* svc.getUserStats({ serverId: 1, plexUserId: "42" })
      expect(stats.totalPlayCount).toBe(4)
      // 60 + 30 + 45 + 45 = 180 seconds
      expect(stats.totalWatchTimeSec).toBe(180)
      expect(stats.lastSeenAt).not.toBeNull()
      // Top media: "Show X" has 2 plays, Movie A has 1, Movie B has 1
      expect(stats.topMedia[0].title).toBe("Show X")
      expect(stats.topMedia[0].playCount).toBe(2)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("session write bumps cached plex_users counters + lastSeenAt", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      const usersRef = yield* Ref.make<ReadonlyArray<MediaServerSharedUser>>([
        {
          plexUserId: "42",
          username: "alice",
          friendlyName: "alice",
          email: null,
          thumb: null,
          isAdmin: false,
        },
      ])
      yield* registerMock(usersRef)
      const svc = yield* PlexUserService
      yield* svc.syncUsers(1)

      const history = yield* SessionHistoryService
      yield* history.writeHistory([
        baseSession({ sessionKey: "a", viewOffset: 60_000, duration: 100_000 }),
        baseSession({ sessionKey: "b", viewOffset: 30_000, duration: 100_000 }),
      ])

      const users = yield* svc.listUsers(1)
      const alice = users.find((u) => u.plexUserId === "42")
      expect(alice?.totalPlayCount).toBe(2)
      expect(alice?.totalWatchTimeSec).toBe(90)
      expect(alice?.lastSeenAt).not.toBeNull()
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("syncUsers returns NotFoundError for unknown server", () =>
    Effect.gen(function* () {
      const svc = yield* PlexUserService
      const err = yield* Effect.flip(svc.syncUsers(999))
      expect(err._tag).toBe("NotFoundError")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("recordWatch is a no-op when user row is absent", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      const svc = yield* PlexUserService
      yield* svc.recordWatch({
        mediaServerId: 1,
        plexUserId: "ghost",
        watchedSec: 30,
        stoppedAt: new Date(),
      })
      const users = yield* svc.listUsers(1)
      expect(users).toHaveLength(0)
    }).pipe(Effect.provide(TestLayer)),
  )
})
