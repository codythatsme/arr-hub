import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer().primaryKey({ autoIncrement: true }),
  username: text().notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const apiKeys = sqliteTable('api_keys', {
  id: integer().primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  kind: text({ enum: ['session', 'api_key'] }).notNull(),
  name: text().notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const qualityProfiles = sqliteTable('quality_profiles', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const movies = sqliteTable('movies', {
  id: integer().primaryKey({ autoIncrement: true }),
  tmdbId: integer('tmdb_id').notNull().unique(),
  title: text().notNull(),
  year: integer(),
  overview: text(),
  posterPath: text('poster_path'),
  status: text({ enum: ['wanted', 'available', 'missing'] })
    .notNull()
    .default('wanted'),
  qualityProfileId: integer('quality_profile_id').references(
    () => qualityProfiles.id,
  ),
  rootFolderPath: text('root_folder_path'),
  monitored: integer({ mode: 'boolean' }).notNull().default(true),
  addedAt: integer('added_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const settings = sqliteTable('settings', {
  key: text().primaryKey(),
  value: text().notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})
