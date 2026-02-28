import { SqlError } from "@effect/sql/SqlError"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { settings } from "#/db/schema"

import { NotFoundError } from "../errors"
import { Db } from "./Db"

export class ConfigService extends Context.Tag("ConfigService")<
  ConfigService,
  {
    readonly get: (key: string) => Effect.Effect<string | null, SqlError>
    readonly getRequired: (key: string) => Effect.Effect<string, NotFoundError | SqlError>
    readonly set: (key: string, value: string) => Effect.Effect<void, SqlError>
  }
>() {}

export const ConfigServiceLive = Layer.effect(
  ConfigService,
  Effect.gen(function* () {
    const db = yield* Db

    return {
      get: (key) =>
        Effect.gen(function* () {
          const rows = yield* db.select().from(settings).where(eq(settings.key, key))
          return rows[0]?.value ?? null
        }),

      getRequired: (key) =>
        Effect.gen(function* () {
          const rows = yield* db.select().from(settings).where(eq(settings.key, key))
          const row = rows[0]
          if (!row) {
            return yield* new NotFoundError({ entity: "setting", id: key })
          }
          return row.value
        }),

      set: (key, value) =>
        Effect.gen(function* () {
          yield* db
            .insert(settings)
            .values({ key, value })
            .onConflictDoUpdate({
              target: settings.key,
              set: { value, updatedAt: new Date() },
            })
        }),
    }
  }),
)
