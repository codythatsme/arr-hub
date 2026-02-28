import type { TRPCRouterRecord } from "@trpc/server"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { z } from "zod"

import { customFormats, customFormatSpecs } from "#/db/schema"
import { NotFoundError } from "#/effect/errors"
import { Db } from "#/effect/services/Db"

import { authedProcedure, runEffect } from "../init"

const specFieldEnum = z.enum([
  "releaseTitle",
  "releaseGroup",
  "edition",
  "source",
  "resolution",
  "qualityModifier",
])

const specSchema = z.object({
  name: z.string(),
  field: specFieldEnum,
  pattern: z.string(),
  negate: z.boolean().optional().default(false),
  required: z.boolean().optional().default(false),
})

const formatInputSchema = z.object({
  name: z.string(),
  includeWhenRenaming: z.boolean().optional().default(false),
  specs: z.array(specSchema).optional().default([]),
})

const formatUpdateSchema = z.object({
  name: z.string().optional(),
  includeWhenRenaming: z.boolean().optional(),
  specs: z.array(specSchema).optional(),
})

export const formatsRouter = {
  list: authedProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const db = yield* Db
        const formats = yield* db.select().from(customFormats)
        const specs = yield* db.select().from(customFormatSpecs)

        return formats.map((f) => ({
          ...f,
          specs: specs.filter((s) => s.customFormatId === f.id),
        }))
      }),
    ),
  ),

  create: authedProcedure.input(formatInputSchema).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const db = yield* Db
        const [format] = yield* db
          .insert(customFormats)
          .values({ name: input.name, includeWhenRenaming: input.includeWhenRenaming })
          .returning()

        if (input.specs.length > 0) {
          yield* db.insert(customFormatSpecs).values(
            input.specs.map((s) => ({
              customFormatId: format.id,
              name: s.name,
              field: s.field,
              pattern: s.pattern,
              negate: s.negate,
              required: s.required,
            })),
          )
        }

        const specs = yield* db
          .select()
          .from(customFormatSpecs)
          .where(eq(customFormatSpecs.customFormatId, format.id))

        return { ...format, specs }
      }),
    ),
  ),

  get: authedProcedure.input(z.object({ id: z.number() })).query(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const db = yield* Db
        const rows = yield* db.select().from(customFormats).where(eq(customFormats.id, input.id))
        const format = rows[0]
        if (!format) {
          return yield* new NotFoundError({ entity: "customFormat", id: input.id })
        }
        const specs = yield* db
          .select()
          .from(customFormatSpecs)
          .where(eq(customFormatSpecs.customFormatId, format.id))
        return { ...format, specs }
      }),
    ),
  ),

  update: authedProcedure
    .input(z.object({ id: z.number(), data: formatUpdateSchema }))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          const db = yield* Db
          const existing = yield* db
            .select()
            .from(customFormats)
            .where(eq(customFormats.id, input.id))
          if (existing.length === 0) {
            return yield* new NotFoundError({ entity: "customFormat", id: input.id })
          }

          const updateSet: Record<string, unknown> = {}
          if (input.data.name !== undefined) updateSet.name = input.data.name
          if (input.data.includeWhenRenaming !== undefined)
            updateSet.includeWhenRenaming = input.data.includeWhenRenaming

          if (Object.keys(updateSet).length > 0) {
            yield* db.update(customFormats).set(updateSet).where(eq(customFormats.id, input.id))
          }

          if (input.data.specs !== undefined) {
            yield* db
              .delete(customFormatSpecs)
              .where(eq(customFormatSpecs.customFormatId, input.id))
            if (input.data.specs.length > 0) {
              yield* db.insert(customFormatSpecs).values(
                input.data.specs.map((s) => ({
                  customFormatId: input.id,
                  name: s.name,
                  field: s.field,
                  pattern: s.pattern,
                  negate: s.negate,
                  required: s.required,
                })),
              )
            }
          }

          const [updated] = yield* db
            .select()
            .from(customFormats)
            .where(eq(customFormats.id, input.id))
          const specs = yield* db
            .select()
            .from(customFormatSpecs)
            .where(eq(customFormatSpecs.customFormatId, input.id))
          return { ...updated, specs }
        }),
      ),
    ),

  delete: authedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const db = yield* Db
        const rows = yield* db
          .delete(customFormats)
          .where(eq(customFormats.id, input.id))
          .returning({ id: customFormats.id })
        if (rows.length === 0) {
          return yield* new NotFoundError({ entity: "customFormat", id: input.id })
        }
      }),
    ),
  ),
} satisfies TRPCRouterRecord
