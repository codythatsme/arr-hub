import { SqlError } from "@effect/sql/SqlError"
import { and, eq, inArray, isNotNull, lt, or } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import {
  apiKeys,
  downloadQueue,
  notificationDeliveries,
  releaseBlocklist,
  releaseDecisions,
  recentReleases,
  schedulerJobs,
} from "#/db/schema"

import { Db } from "./Db"

const DAY_MS = 24 * 60 * 60 * 1000

const RETENTION = {
  schedulerJobsDays: 30,
  notificationDeliveriesDays: 30,
  releaseDecisionsDays: 30,
  releaseBlocklistDays: 180,
  recentReleasesDays: 14,
  staleQueueDays: 14,
  expiredSessionsDays: 7,
} as const

export interface HousekeepingSummary {
  readonly schedulerJobsDeleted: number
  readonly notificationDeliveriesDeleted: number
  readonly releaseDecisionsDeleted: number
  readonly releaseBlocklistDeleted: number
  readonly recentReleasesDeleted: number
  readonly queueRowsDeleted: number
  readonly expiredSessionsDeleted: number
}

export class MaintenanceService extends Context.Tag("@arr-hub/MaintenanceService")<
  MaintenanceService,
  {
    readonly runHousekeeping: () => Effect.Effect<HousekeepingSummary, SqlError>
  }
>() {}

function daysAgo(days: number) {
  return new Date(Date.now() - days * DAY_MS)
}

export const MaintenanceServiceLive = Layer.effect(
  MaintenanceService,
  Effect.gen(function* () {
    const db = yield* Db

    return {
      runHousekeeping: () =>
        Effect.gen(function* () {
          const oldSchedulerJobs = yield* db
            .delete(schedulerJobs)
            .where(
              and(
                inArray(schedulerJobs.status, ["completed", "failed", "dead"]),
                lt(schedulerJobs.createdAt, daysAgo(RETENTION.schedulerJobsDays)),
              ),
            )
            .returning({ id: schedulerJobs.id })

          const oldNotifications = yield* db
            .delete(notificationDeliveries)
            .where(
              lt(notificationDeliveries.deliveredAt, daysAgo(RETENTION.notificationDeliveriesDays)),
            )
            .returning({ id: notificationDeliveries.id })

          const oldReleaseDecisions = yield* db
            .delete(releaseDecisions)
            .where(lt(releaseDecisions.decidedAt, daysAgo(RETENTION.releaseDecisionsDays)))
            .returning({ id: releaseDecisions.id })

          const oldBlocklistRows = yield* db
            .delete(releaseBlocklist)
            .where(lt(releaseBlocklist.createdAt, daysAgo(RETENTION.releaseBlocklistDays)))
            .returning({ id: releaseBlocklist.id })

          const oldRecentReleases = yield* db
            .delete(recentReleases)
            .where(lt(recentReleases.lastSeenAt, daysAgo(RETENTION.recentReleasesDays)))
            .returning({ id: recentReleases.id })

          const oldQueueRows = yield* db
            .delete(downloadQueue)
            .where(
              and(
                inArray(downloadQueue.status, ["completed", "failed"]),
                lt(downloadQueue.updatedAt, daysAgo(RETENTION.staleQueueDays)),
              ),
            )
            .returning({ id: downloadQueue.id })

          const expiredSessions = yield* db
            .delete(apiKeys)
            .where(
              and(
                eq(apiKeys.kind, "session"),
                or(
                  and(
                    isNotNull(apiKeys.expiresAt),
                    lt(apiKeys.expiresAt, daysAgo(RETENTION.expiredSessionsDays)),
                  ),
                  and(
                    isNotNull(apiKeys.revokedAt),
                    lt(apiKeys.revokedAt, daysAgo(RETENTION.expiredSessionsDays)),
                  ),
                ),
              ),
            )
            .returning({ id: apiKeys.id })

          return {
            schedulerJobsDeleted: oldSchedulerJobs.length,
            notificationDeliveriesDeleted: oldNotifications.length,
            releaseDecisionsDeleted: oldReleaseDecisions.length,
            releaseBlocklistDeleted: oldBlocklistRows.length,
            recentReleasesDeleted: oldRecentReleases.length,
            queueRowsDeleted: oldQueueRows.length,
            expiredSessionsDeleted: expiredSessions.length,
          }
        }),
    }
  }),
)
