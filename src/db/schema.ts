import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

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
  upgradeAllowed: integer('upgrade_allowed', { mode: 'boolean' }).notNull().default(false),
  minFormatScore: integer('min_format_score').notNull().default(0),
  cutoffFormatScore: integer('cutoff_format_score').notNull().default(0),
  minUpgradeFormatScore: integer('min_upgrade_format_score').notNull().default(1),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  appliedBundleId: text('applied_bundle_id'),
  appliedBundleVersion: integer('applied_bundle_version'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const qualityItems = sqliteTable('quality_items', {
  id: integer().primaryKey({ autoIncrement: true }),
  profileId: integer('profile_id')
    .notNull()
    .references(() => qualityProfiles.id, { onDelete: 'cascade' }),
  qualityName: text('quality_name'),
  groupName: text('group_name'),
  weight: integer().notNull(),
  allowed: integer({ mode: 'boolean' }).notNull().default(true),
})

export const customFormats = sqliteTable('custom_formats', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull().unique(),
  includeWhenRenaming: integer('include_when_renaming', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const customFormatSpecs = sqliteTable('custom_format_specs', {
  id: integer().primaryKey({ autoIncrement: true }),
  customFormatId: integer('custom_format_id')
    .notNull()
    .references(() => customFormats.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  field: text({ enum: ['releaseTitle', 'releaseGroup', 'edition', 'source', 'resolution', 'qualityModifier'] }).notNull(),
  pattern: text().notNull(),
  negate: integer({ mode: 'boolean' }).notNull().default(false),
  required: integer({ mode: 'boolean' }).notNull().default(false),
})

export const customFormatScores = sqliteTable(
  'custom_format_scores',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    profileId: integer('profile_id')
      .notNull()
      .references(() => qualityProfiles.id, { onDelete: 'cascade' }),
    customFormatId: integer('custom_format_id')
      .notNull()
      .references(() => customFormats.id, { onDelete: 'cascade' }),
    score: integer().notNull().default(0),
  },
  (t) => [unique().on(t.profileId, t.customFormatId)],
)

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
