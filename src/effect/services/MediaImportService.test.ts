import { access, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { describe, expect, it } from "@effect/vitest"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"

import {
  downloadClients,
  episodes,
  mediaFiles,
  movies,
  qualityItems,
  qualityProfiles,
  releaseDecisions,
  remotePathMappings,
  seasons,
  series,
} from "#/db/schema"
import { Db } from "#/effect/services/Db"
import { TestDbLive } from "#/effect/test/TestDb"

import { MediaImportService, MediaImportServiceLive } from "./MediaImportService"
import { SettingsService, SettingsServiceLive } from "./SettingsService"
import { TitleParserServiceLive } from "./TitleParserService"

const TestLayer = MediaImportServiceLive.pipe(
  Layer.provideMerge(SettingsServiceLive),
  Layer.provideMerge(TitleParserServiceLive),
  Layer.provideMerge(TestDbLive),
)

const withTempDir = Effect.acquireRelease(
  Effect.tryPromise(() => mkdtemp(path.join(tmpdir(), "arr-hub-import-test-"))),
  (dir) => Effect.tryPromise(() => rm(dir, { recursive: true, force: true })).pipe(Effect.orDie),
)

function writeMediaFile(filePath: string, content = "media") {
  return Effect.tryPromise(async () => {
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, content, "utf8")
  })
}

function pathExists(filePath: string): Effect.Effect<boolean, never> {
  return Effect.promise(() =>
    access(filePath).then(
      () => true,
      () => false,
    ),
  )
}

function seedMovie(rootFolderPath: string, tmdbId = 10) {
  return Effect.gen(function* () {
    const db = yield* Db
    const profile = yield* db
      .insert(qualityProfiles)
      .values({ name: `Profile ${tmdbId}` })
      .returning({ id: qualityProfiles.id })
    yield* db.insert(qualityItems).values({
      profileId: profile[0].id,
      qualityName: "WEBDL1080p",
      weight: 40,
      allowed: true,
    })
    const movie = yield* db
      .insert(movies)
      .values({
        tmdbId,
        title: "Example Movie",
        year: 2026,
        qualityProfileId: profile[0].id,
        rootFolderPath,
      })
      .returning({ id: movies.id })
    return { movieId: movie[0].id, profileId: profile[0].id }
  })
}

describe("MediaImportService", () => {
  it.scoped("copies the largest movie file into the movie folder and updates quality", () =>
    Effect.gen(function* () {
      const workspace = yield* withTempDir
      const sourceDir = path.join(workspace, "downloads", "Example.Movie.2026")
      const rootFolder = path.join(workspace, "library")
      const releaseTitle = "Example.Movie.2026.1080p.WEB-DL-GRP"
      yield* writeMediaFile(path.join(sourceDir, "sample.mkv"), "sample")
      const sourceFile = path.join(sourceDir, "Example.Movie.2026.1080p.WEB-DL-GRP.mkv")
      yield* writeMediaFile(sourceFile, "full media")

      const { movieId } = yield* seedMovie(rootFolder)
      const db = yield* Db
      yield* db.insert(releaseDecisions).values({
        mediaId: movieId,
        mediaType: "movie",
        candidateTitle: releaseTitle,
        qualityRank: 55,
        formatScore: 120,
        decision: "accepted",
      })

      const importer = yield* MediaImportService
      const result = yield* importer.importMovie({
        movieId,
        sourcePath: sourceDir,
        releaseTitle,
      })

      expect(result.targetPath).toBe(
        path.join(rootFolder, "Example Movie (2026)", "Example Movie (2026) - WEBDL1080p.mkv"),
      )
      expect(yield* pathExists(sourceFile)).toBe(true)
      expect(yield* pathExists(result.targetPath)).toBe(true)

      const movieRows = yield* db.select().from(movies).where(eq(movies.id, movieId))
      expect(movieRows[0].status).toBe("available")
      expect(movieRows[0].hasFile).toBe(true)
      expect(movieRows[0].filePath).toBe(result.targetPath)
      expect(movieRows[0].existingQualityName).toBe("WEBDL1080p")
      expect(movieRows[0].existingQualityRank).toBe(55)
      expect(movieRows[0].existingFormatScore).toBe(120)

      const fileRows = yield* db.select().from(mediaFiles)
      expect(fileRows).toHaveLength(1)
      expect(fileRows[0].mediaKind).toBe("movie")
      expect(fileRows[0].mediaId).toBe(movieId)
      expect(fileRows[0].path).toBe(result.targetPath)
      expect(fileRows[0].sizeBytes).toBe(result.sizeBytes)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.scoped("maps remote download paths before importing", () =>
    Effect.gen(function* () {
      const workspace = yield* withTempDir
      const remoteRoot = "/remote/downloads"
      const localRoot = path.join(workspace, "downloads")
      const rootFolder = path.join(workspace, "library")
      const localSource = path.join(localRoot, "Example.Movie.2026.1080p.WEB-DL.mkv")
      yield* writeMediaFile(localSource, "full media")

      const db = yield* Db
      const client = yield* db
        .insert(downloadClients)
        .values({
          name: "qBit",
          type: "qbittorrent",
          host: "download-host",
          port: 8080,
          username: "admin",
          passwordEncrypted: "enc",
        })
        .returning({ id: downloadClients.id })
      yield* db.insert(remotePathMappings).values({
        downloadClientId: client[0].id,
        remotePath: remoteRoot,
        localPath: localRoot,
      })
      const { movieId } = yield* seedMovie(rootFolder, 13)

      const importer = yield* MediaImportService
      const result = yield* importer.importMovie({
        movieId,
        sourcePath: `${remoteRoot}/Example.Movie.2026.1080p.WEB-DL.mkv`,
        releaseTitle: "Example.Movie.2026.1080p.WEB-DL-GRP",
        downloadClientId: client[0].id,
      })

      expect(result.sourcePath).toBe(localSource)
      expect(yield* pathExists(result.targetPath)).toBe(true)
      const fileRows = yield* db.select().from(mediaFiles).where(eq(mediaFiles.mediaId, movieId))
      expect(fileRows[0].sourcePath).toBe(localSource)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.scoped("moves season-pack files to season folders and updates episodes", () =>
    Effect.gen(function* () {
      const workspace = yield* withTempDir
      const sourceDir = path.join(workspace, "downloads", "Test.Show.S01")
      const rootFolder = path.join(workspace, "tv")
      const releaseTitle = "Test.Show.S01.720p.HDTV-GRP"
      const sourceOne = path.join(sourceDir, "Test.Show.S01E01.720p.HDTV-GRP.mkv")
      const sourceTwo = path.join(sourceDir, "Test.Show.S01E02.720p.HDTV-GRP.mkv")
      yield* writeMediaFile(sourceOne, "episode one")
      yield* writeMediaFile(sourceTwo, "episode two")

      const db = yield* Db
      const settings = yield* SettingsService
      yield* settings.set("media.fileHandling", "move")
      const profile = yield* db
        .insert(qualityProfiles)
        .values({ name: "TV Profile" })
        .returning({ id: qualityProfiles.id })
      yield* db.insert(qualityItems).values({
        profileId: profile[0].id,
        qualityName: "HDTV720p",
        weight: 20,
        allowed: true,
      })
      const show = yield* db
        .insert(series)
        .values({
          tvdbId: 200,
          title: "Test Show",
          qualityProfileId: profile[0].id,
          rootFolderPath: rootFolder,
          seasonFolder: true,
        })
        .returning({ id: series.id })
      const season = yield* db
        .insert(seasons)
        .values({ seriesId: show[0].id, seasonNumber: 1 })
        .returning({ id: seasons.id })
      const episodeRows = yield* db
        .insert(episodes)
        .values([
          { seasonId: season[0].id, tvdbId: 2001, title: "Pilot", episodeNumber: 1 },
          { seasonId: season[0].id, tvdbId: 2002, title: "Second", episodeNumber: 2 },
        ])
        .returning({ id: episodes.id })
      yield* db.insert(releaseDecisions).values({
        mediaId: season[0].id,
        mediaType: "season",
        candidateTitle: releaseTitle,
        qualityRank: 25,
        formatScore: 10,
        decision: "accepted",
      })

      const importer = yield* MediaImportService
      const results = yield* importer.importEpisodes({
        seriesId: show[0].id,
        episodeIds: episodeRows.map((row) => row.id),
        sourcePath: sourceDir,
        releaseTitle,
      })

      expect(results).toHaveLength(2)
      expect(yield* pathExists(sourceOne)).toBe(false)
      expect(yield* pathExists(sourceTwo)).toBe(false)
      for (const result of results) {
        expect(yield* pathExists(result.targetPath)).toBe(true)
        expect(result.targetPath).toContain(path.join("Test Show", "Season 01"))
      }

      const importedEpisodes = yield* db.select().from(episodes)
      for (const row of importedEpisodes) {
        expect(row.hasFile).toBe(true)
        expect(row.filePath).toContain("Test Show - S01E")
        expect(row.existingQualityName).toBe("HDTV720p")
        expect(row.existingQualityRank).toBe(25)
        expect(row.existingFormatScore).toBe(10)
      }
      const fileRows = yield* db.select().from(mediaFiles)
      expect(fileRows).toHaveLength(2)
      expect(fileRows.map((row) => row.mediaKind)).toEqual(["episode", "episode"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.scoped("hardlinks a movie file when hardlink handling is selected", () =>
    Effect.gen(function* () {
      const workspace = yield* withTempDir
      const rootFolder = path.join(workspace, "library")
      const sourceFile = path.join(workspace, "downloads", "Example.Movie.2026.1080p.WEB-DL.mkv")
      yield* writeMediaFile(sourceFile, "full media")
      const { movieId } = yield* seedMovie(rootFolder, 11)
      const settings = yield* SettingsService
      yield* settings.set("media.fileHandling", "hardlink")

      const importer = yield* MediaImportService
      const result = yield* importer.importMovie({
        movieId,
        sourcePath: sourceFile,
        releaseTitle: "Example.Movie.2026.1080p.WEB-DL-GRP",
      })

      const [sourceStats, targetStats] = yield* Effect.all([
        Effect.tryPromise(() => stat(sourceFile)),
        Effect.tryPromise(() => stat(result.targetPath)),
      ])
      expect(sourceStats.ino).toBe(targetStats.ino)
      expect(targetStats.nlink).toBeGreaterThanOrEqual(2)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fails when a completed download has no output path", () =>
    Effect.gen(function* () {
      const { movieId } = yield* seedMovie("/tmp/library", 12)
      const importer = yield* MediaImportService
      const error = yield* Effect.flip(
        importer.importMovie({
          movieId,
          sourcePath: null,
          releaseTitle: "Example.Movie.2026.1080p.WEB-DL-GRP",
        }),
      )

      expect(error._tag).toBe("MediaImportError")
      if (error._tag === "MediaImportError") {
        expect(error.reason).toBe("missing_output_path")
      }
    }).pipe(Effect.provide(TestLayer)),
  )
})
