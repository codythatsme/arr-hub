import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import {
  apiKeys,
  downloadClients,
  downloadQueue,
  indexers,
  notificationDeliveries,
  releaseBlocklist,
  releaseDecisions,
  recentReleases,
  schedulerJobs,
  users,
} from "#/db/schema"
import { Db } from "#/effect/services/Db"
import { TestDbLive } from "#/effect/test/TestDb"

import { MaintenanceService, MaintenanceServiceLive } from "./MaintenanceService"

const TestLayer = MaintenanceServiceLive.pipe(Layer.provideMerge(TestDbLive))
const DAY_MS = 24 * 60 * 60 * 1000

function daysAgo(days: number) {
  return new Date(Date.now() - days * DAY_MS)
}

describe("MaintenanceService", () => {
  it.effect("deletes stale housekeeping rows while preserving recent and active records", () =>
    Effect.gen(function* () {
      const db = yield* Db
      const service = yield* MaintenanceService

      const userRows = yield* db
        .insert(users)
        .values({ username: "admin", passwordHash: "hash" })
        .returning({ id: users.id })
      const userId = userRows[0].id

      yield* db.insert(apiKeys).values([
        {
          userId,
          kind: "session",
          name: "old session",
          tokenHash: "old-session",
          expiresAt: daysAgo(10),
        },
        {
          userId,
          kind: "session",
          name: "recent session",
          tokenHash: "recent-session",
          expiresAt: daysAgo(1),
        },
        {
          userId,
          kind: "api_key",
          name: "api key",
          tokenHash: "api-key",
          createdAt: daysAgo(100),
        },
      ])

      yield* db.insert(schedulerJobs).values([
        {
          jobType: "rss_sync",
          status: "completed",
          dedupeKey: "old-completed",
          payload: { _tag: "rss_sync" },
          createdAt: daysAgo(40),
        },
        {
          jobType: "rss_sync",
          status: "pending",
          dedupeKey: "old-pending",
          payload: { _tag: "rss_sync" },
          createdAt: daysAgo(40),
        },
        {
          jobType: "rss_sync",
          status: "completed",
          dedupeKey: "recent-completed",
          payload: { _tag: "rss_sync" },
          createdAt: daysAgo(2),
        },
      ])

      yield* db.insert(notificationDeliveries).values([
        {
          event: "new_content",
          title: "old",
          message: "old",
          payload: {},
          status: "sent",
          deliveredAt: daysAgo(45),
        },
        {
          event: "new_content",
          title: "recent",
          message: "recent",
          payload: {},
          status: "sent",
          deliveredAt: daysAgo(3),
        },
      ])

      yield* db.insert(releaseDecisions).values([
        {
          mediaId: 1,
          mediaType: "movie",
          candidateTitle: "Old.Release",
          decision: "rejected",
          decidedAt: daysAgo(45),
        },
        {
          mediaId: 1,
          mediaType: "movie",
          candidateTitle: "Recent.Release",
          decision: "accepted",
          decidedAt: daysAgo(3),
        },
      ])

      yield* db.insert(releaseBlocklist).values([
        {
          mediaId: 1,
          mediaType: "movie",
          candidateTitle: "Old.Blocklist",
          reason: "manual",
          createdAt: daysAgo(200),
        },
        {
          mediaId: 1,
          mediaType: "movie",
          candidateTitle: "Recent.Blocklist",
          reason: "manual",
          createdAt: daysAgo(3),
        },
      ])

      const indexerRows = yield* db
        .insert(indexers)
        .values({
          name: "Indexer",
          type: "torznab",
          baseUrl: "https://indexer.example",
          apiKeyEncrypted: "secret",
        })
        .returning({ id: indexers.id })
      const indexerId = indexerRows[0].id

      yield* db.insert(recentReleases).values([
        {
          indexerId,
          releaseKey: "old",
          title: "Old Recent",
          indexerName: "Indexer",
          indexerPriority: 50,
          size: 1_000,
          age: 20,
          downloadUrl: "https://indexer.example/old",
          category: "2000",
          protocol: "torrent",
          publishedAt: daysAgo(20),
          lastSeenAt: daysAgo(20),
        },
        {
          indexerId,
          releaseKey: "fresh",
          title: "Fresh Recent",
          indexerName: "Indexer",
          indexerPriority: 50,
          size: 1_000,
          age: 1,
          downloadUrl: "https://indexer.example/fresh",
          category: "2000",
          protocol: "torrent",
          publishedAt: daysAgo(1),
          lastSeenAt: daysAgo(1),
        },
      ])

      const clientRows = yield* db
        .insert(downloadClients)
        .values({
          name: "client",
          type: "sabnzbd",
          host: "localhost",
          port: 8080,
          username: "",
          passwordEncrypted: "",
          useSsl: false,
        })
        .returning({ id: downloadClients.id })
      const clientId = clientRows[0].id

      yield* db.insert(downloadQueue).values([
        {
          downloadClientId: clientId,
          externalId: "old-completed",
          status: "completed",
          title: "Old Completed",
          updatedAt: daysAgo(20),
        },
        {
          downloadClientId: clientId,
          externalId: "old-active",
          status: "downloading",
          title: "Old Active",
          updatedAt: daysAgo(20),
        },
        {
          downloadClientId: clientId,
          externalId: "recent-completed",
          status: "completed",
          title: "Recent Completed",
          updatedAt: daysAgo(2),
        },
      ])

      const summary = yield* service.runHousekeeping()

      const remainingKeys = yield* db.select().from(apiKeys)
      const remainingJobs = yield* db.select().from(schedulerJobs)
      const remainingNotifications = yield* db.select().from(notificationDeliveries)
      const remainingDecisions = yield* db.select().from(releaseDecisions)
      const remainingBlocklist = yield* db.select().from(releaseBlocklist)
      const remainingRecentReleases = yield* db.select().from(recentReleases)
      const remainingQueue = yield* db.select().from(downloadQueue)

      expect(summary).toEqual({
        schedulerJobsDeleted: 1,
        notificationDeliveriesDeleted: 1,
        releaseDecisionsDeleted: 1,
        releaseBlocklistDeleted: 1,
        recentReleasesDeleted: 1,
        queueRowsDeleted: 1,
        expiredSessionsDeleted: 1,
      })
      expect(remainingKeys.map((row) => row.tokenHash).toSorted()).toEqual([
        "api-key",
        "recent-session",
      ])
      expect(remainingJobs.map((row) => row.dedupeKey).toSorted()).toEqual([
        "old-pending",
        "recent-completed",
      ])
      expect(remainingNotifications.map((row) => row.title)).toEqual(["recent"])
      expect(remainingDecisions.map((row) => row.candidateTitle)).toEqual(["Recent.Release"])
      expect(remainingBlocklist.map((row) => row.candidateTitle)).toEqual(["Recent.Blocklist"])
      expect(remainingRecentReleases.map((row) => row.releaseKey)).toEqual(["fresh"])
      expect(remainingQueue.map((row) => row.externalId).toSorted()).toEqual([
        "old-active",
        "recent-completed",
      ])
    }).pipe(Effect.provide(TestLayer)),
  )
})
