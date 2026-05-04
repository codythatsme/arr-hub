import { SqlError } from "@effect/sql/SqlError"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { settings } from "#/db/schema"

import { SettingsError } from "../errors"
import { Db } from "./Db"

export type SettingKey =
  | "app.name"
  | "app.updateChannel"
  | "media.namingConvention"
  | "media.fileHandling"
  | "scheduler.paused"

const SETTING_DEFINITIONS: Record<SettingKey, { readonly label: string; readonly group: string }> =
  {
    "app.name": { label: "App name", group: "General" },
    "app.updateChannel": { label: "Update channel", group: "General" },
    "media.namingConvention": { label: "Naming convention", group: "Media Management" },
    "media.fileHandling": { label: "File handling", group: "Media Management" },
    "scheduler.paused": { label: "Scheduler paused", group: "Scheduler" },
  }

const DEFAULT_VALUES: Record<SettingKey, string> = {
  "app.name": "ARR Hub",
  "app.updateChannel": "stable",
  "media.namingConvention": "{Title} ({Year})",
  "media.fileHandling": "copy",
  "scheduler.paused": "false",
}

export interface SettingEntry {
  readonly key: SettingKey
  readonly label: string
  readonly group: string
  readonly value: string
  readonly updatedAt: Date | null
}

function parseKey(key: string): Effect.Effect<SettingKey, SettingsError> {
  if (key in SETTING_DEFINITIONS) return Effect.succeed(key as SettingKey)
  return Effect.fail(
    new SettingsError({ reason: "invalid_key", message: `unknown setting key: ${key}` }),
  )
}

function validateValue(key: SettingKey, value: string): Effect.Effect<string, SettingsError> {
  const trimmed = value.trim()
  if (key === "app.name" && trimmed.length === 0) {
    return Effect.fail(
      new SettingsError({ reason: "invalid_value", message: "app name cannot be empty" }),
    )
  }
  if (key === "app.updateChannel" && !["stable", "beta"].includes(trimmed)) {
    return Effect.fail(
      new SettingsError({
        reason: "invalid_value",
        message: "update channel must be stable or beta",
      }),
    )
  }
  if (key === "media.fileHandling" && !["copy", "move", "hardlink"].includes(trimmed)) {
    return Effect.fail(
      new SettingsError({
        reason: "invalid_value",
        message: "file handling must be copy, move, or hardlink",
      }),
    )
  }
  if (key === "scheduler.paused" && !["true", "false"].includes(trimmed)) {
    return Effect.fail(
      new SettingsError({
        reason: "invalid_value",
        message: "scheduler.paused must be true or false",
      }),
    )
  }
  return Effect.succeed(trimmed)
}

export class SettingsService extends Context.Tag("@arr-hub/SettingsService")<
  SettingsService,
  {
    readonly list: () => Effect.Effect<ReadonlyArray<SettingEntry>, SqlError>
    readonly get: (key: string) => Effect.Effect<SettingEntry, SettingsError | SqlError>
    readonly set: (
      key: string,
      value: string,
    ) => Effect.Effect<SettingEntry, SettingsError | SqlError>
  }
>() {}

export const SettingsServiceLive = Layer.effect(
  SettingsService,
  Effect.gen(function* () {
    const db = yield* Db

    const buildEntry = (key: SettingKey, value: string, updatedAt: Date | null): SettingEntry => ({
      key,
      label: SETTING_DEFINITIONS[key].label,
      group: SETTING_DEFINITIONS[key].group,
      value,
      updatedAt,
    })

    return {
      list: () =>
        Effect.gen(function* () {
          const rows = yield* db.select().from(settings)
          const values = new Map(rows.map((row) => [row.key, row]))
          return (Object.keys(SETTING_DEFINITIONS) as Array<SettingKey>).map((key) => {
            const row = values.get(key)
            return buildEntry(key, row?.value ?? DEFAULT_VALUES[key], row?.updatedAt ?? null)
          })
        }),

      get: (rawKey) =>
        Effect.gen(function* () {
          const key = yield* parseKey(rawKey)
          const rows = yield* db.select().from(settings).where(eq(settings.key, key))
          const row = rows[0]
          return buildEntry(key, row?.value ?? DEFAULT_VALUES[key], row?.updatedAt ?? null)
        }),

      set: (rawKey, rawValue) =>
        Effect.gen(function* () {
          const key = yield* parseKey(rawKey)
          const value = yield* validateValue(key, rawValue)
          yield* db
            .insert(settings)
            .values({ key, value })
            .onConflictDoUpdate({
              target: settings.key,
              set: { value, updatedAt: new Date() },
            })
          const rows = yield* db.select().from(settings).where(eq(settings.key, key))
          const row = rows[0]
          return buildEntry(key, row?.value ?? value, row?.updatedAt ?? null)
        }),
    }
  }),
)
