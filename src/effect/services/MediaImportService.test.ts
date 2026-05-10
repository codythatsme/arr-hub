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

function seedEpisode(rootFolderPath: string, tvdbBase = 500) {
  return Effect.gen(function* () {
    const db = yield* Db
    const profile = yield* db
      .insert(qualityProfiles)
      .values({ name: `TV Profile ${tvdbBase}` })
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
        tvdbId: tvdbBase,
        title: "Test Show",
        qualityProfileId: profile[0].id,
        rootFolderPath,
        seasonFolder: true,
      })
      .returning({ id: series.id })
    const season = yield* db
      .insert(seasons)
      .values({ seriesId: show[0].id, seasonNumber: 1 })
      .returning({ id: seasons.id })
    const episode = yield* db
      .insert(episodes)
      .values({
        seasonId: season[0].id,
        tvdbId: tvdbBase + 1,
        title: "Pilot",
        episodeNumber: 1,
      })
      .returning({ id: episodes.id })
    return { showId: show[0].id, episodeId: episode[0].id, profileId: profile[0].id }
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

  it.effect("manages remote path mappings", () =>
    Effect.gen(function* () {
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
      const importer = yield* MediaImportService

      const added = yield* importer.addRemotePathMapping({
        downloadClientId: client[0].id,
        remotePath: "/downloads",
        localPath: "/mnt/downloads",
      })
      expect(added.remotePath).toBe("/downloads")

      const updated = yield* importer.updateRemotePathMapping(added.id, {
        downloadClientId: client[0].id,
        remotePath: "/remote",
        localPath: "/local",
      })
      expect(updated.remotePath).toBe("/remote")
      expect(updated.localPath).toBe("/local")

      const rows = yield* importer.listRemotePathMappings()
      expect(rows).toHaveLength(1)
      yield* importer.removeRemotePathMapping(added.id)
      expect(yield* importer.listRemotePathMappings()).toHaveLength(0)
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

  it.scoped("scans existing movie and episode files into the library", () =>
    Effect.gen(function* () {
      const workspace = yield* withTempDir
      const movieRoot = path.join(workspace, "movies")
      const tvRoot = path.join(workspace, "tv")
      const movieFile = path.join(
        movieRoot,
        "Example Movie (2026)",
        "Example.Movie.2026.1080p.WEB-DL.mkv",
      )
      const episodeFile = path.join(
        tvRoot,
        "Test Show",
        "Season 01",
        "Test.Show.S01E01.720p.HDTV.mkv",
      )
      yield* writeMediaFile(movieFile, "movie")
      yield* writeMediaFile(episodeFile, "episode")

      const db = yield* Db
      const { movieId } = yield* seedMovie(movieRoot, 14)
      const profile = yield* db
        .insert(qualityProfiles)
        .values({ name: "Scan TV Profile" })
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
          tvdbId: 300,
          title: "Test Show",
          rootFolderPath: tvRoot,
          qualityProfileId: profile[0].id,
        })
        .returning({ id: series.id })
      const season = yield* db
        .insert(seasons)
        .values({ seriesId: show[0].id, seasonNumber: 1 })
        .returning({ id: seasons.id })
      const episode = yield* db
        .insert(episodes)
        .values({ seasonId: season[0].id, tvdbId: 3001, title: "Pilot", episodeNumber: 1 })
        .returning({ id: episodes.id })

      const importer = yield* MediaImportService
      const result = yield* importer.scanLibraries()
      expect(result.moviesImported).toBe(1)
      expect(result.episodesImported).toBe(1)

      const movieRows = yield* db.select().from(movies).where(eq(movies.id, movieId))
      expect(movieRows[0].filePath).toBe(movieFile)
      const episodeRows = yield* db.select().from(episodes).where(eq(episodes.id, episode[0].id))
      expect(episodeRows[0].filePath).toBe(episodeFile)
      expect(yield* db.select().from(mediaFiles)).toHaveLength(2)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.scoped("previews and applies movie renames", () =>
    Effect.gen(function* () {
      const workspace = yield* withTempDir
      const rootFolder = path.join(workspace, "library")
      const currentPath = path.join(rootFolder, "Example Movie (2026)", "bad-name.mkv")
      yield* writeMediaFile(currentPath, "movie")
      const { movieId } = yield* seedMovie(rootFolder, 15)
      const db = yield* Db
      yield* db
        .update(movies)
        .set({
          status: "available",
          hasFile: true,
          filePath: currentPath,
          existingQualityName: "WEBDL1080p",
          existingQualityRank: 40,
          existingFormatScore: 0,
        })
        .where(eq(movies.id, movieId))
      yield* db.insert(mediaFiles).values({
        mediaKind: "movie",
        mediaId: movieId,
        path: currentPath,
        sourcePath: currentPath,
        sizeBytes: 5,
        qualityName: "WEBDL1080p",
        qualityRank: 40,
      })

      const importer = yield* MediaImportService
      const preview = yield* importer.previewMovieRename(movieId)
      expect(preview).toHaveLength(1)
      expect(preview[0].targetPath).toContain("Example Movie (2026) - WEBDL1080p.mkv")
      const applied = yield* importer.renameMovie(movieId)
      expect(applied).toEqual(preview)
      expect(yield* pathExists(currentPath)).toBe(false)
      expect(yield* pathExists(preview[0].targetPath)).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.scoped("previews and applies series episode renames", () =>
    Effect.gen(function* () {
      const workspace = yield* withTempDir
      const rootFolder = path.join(workspace, "tv")
      const currentPath = path.join(rootFolder, "Test Show", "bad-name.mkv")
      yield* writeMediaFile(currentPath, "episode")

      const db = yield* Db
      const show = yield* db
        .insert(series)
        .values({
          tvdbId: 400,
          title: "Test Show",
          rootFolderPath: rootFolder,
          seasonFolder: true,
        })
        .returning({ id: series.id })
      const season = yield* db
        .insert(seasons)
        .values({ seriesId: show[0].id, seasonNumber: 1 })
        .returning({ id: seasons.id })
      const episode = yield* db
        .insert(episodes)
        .values({
          seasonId: season[0].id,
          tvdbId: 4001,
          title: "Pilot",
          episodeNumber: 1,
          hasFile: true,
          filePath: currentPath,
          existingQualityName: "HDTV720p",
          existingQualityRank: 20,
          existingFormatScore: 5,
        })
        .returning({ id: episodes.id })

      const importer = yield* MediaImportService
      const preview = yield* importer.previewSeriesRename(show[0].id)
      expect(preview).toHaveLength(1)
      expect(preview[0].targetPath).toContain("Test Show - S01E01 - Pilot - HDTV720p.mkv")
      const applied = yield* importer.renameSeries(show[0].id)
      expect(applied).toEqual(preview)
      expect(yield* pathExists(currentPath)).toBe(false)
      expect(yield* pathExists(preview[0].targetPath)).toBe(true)

      const episodeRows = yield* db.select().from(episodes).where(eq(episodes.id, episode[0].id))
      expect(episodeRows[0].filePath).toBe(preview[0].targetPath)
      const fileRows = yield* db
        .select()
        .from(mediaFiles)
        .where(eq(mediaFiles.mediaId, episode[0].id))
      expect(fileRows).toHaveLength(1)
      expect(fileRows[0].path).toBe(preview[0].targetPath)
      expect(fileRows[0].qualityName).toBe("HDTV720p")
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

  it.scoped("rejects a movie import whose release title does not match the target movie", () =>
    Effect.gen(function* () {
      const workspace = yield* withTempDir
      const sourceFile = path.join(workspace, "downloads", "Wrong.Movie.2026.1080p.WEB-DL.mkv")
      yield* writeMediaFile(sourceFile, "wrong movie")
      const { movieId } = yield* seedMovie(path.join(workspace, "library"), 16)

      const importer = yield* MediaImportService
      const error = yield* Effect.flip(
        importer.importMovie({
          movieId,
          sourcePath: sourceFile,
          releaseTitle: "Wrong.Movie.2026.1080p.WEB-DL-GRP",
        }),
      )

      expect(error._tag).toBe("MediaImportError")
      if (error._tag === "MediaImportError") {
        expect(error.reason).toBe("media_mismatch")
      }
    }).pipe(Effect.provide(TestLayer)),
  )

  it.scoped("rejects import quality that is not allowed by the target profile", () =>
    Effect.gen(function* () {
      const workspace = yield* withTempDir
      const sourceFile = path.join(workspace, "downloads", "Example.Movie.2026.720p.HDTV.mkv")
      yield* writeMediaFile(sourceFile, "low quality")
      const { movieId } = yield* seedMovie(path.join(workspace, "library"), 17)

      const importer = yield* MediaImportService
      const error = yield* Effect.flip(
        importer.importMovie({
          movieId,
          sourcePath: sourceFile,
          releaseTitle: "Example.Movie.2026.720p.HDTV-GRP",
        }),
      )

      expect(error._tag).toBe("MediaImportError")
      if (error._tag === "MediaImportError") {
        expect(error.reason).toBe("quality_not_allowed")
      }
    }).pipe(Effect.provide(TestLayer)),
  )

  it.scoped("rejects completed episode files with wrong season or episode keys", () =>
    Effect.gen(function* () {
      const workspace = yield* withTempDir
      const sourceFile = path.join(workspace, "downloads", "Test.Show.S01E02.720p.HDTV-GRP.mkv")
      yield* writeMediaFile(sourceFile, "wrong episode")
      const { showId, episodeId } = yield* seedEpisode(path.join(workspace, "tv"), 600)

      const importer = yield* MediaImportService
      const error = yield* Effect.flip(
        importer.importEpisodes({
          seriesId: showId,
          episodeIds: [episodeId],
          sourcePath: sourceFile,
          releaseTitle: "Test.Show.S01E01.720p.HDTV-GRP",
        }),
      )

      expect(error._tag).toBe("MediaImportError")
      if (error._tag === "MediaImportError") {
        expect(error.reason).toBe("episode_match_failed")
      }
    }).pipe(Effect.provide(TestLayer)),
  )

  it.scoped("rejects completed imports that would downgrade an existing file", () =>
    Effect.gen(function* () {
      const workspace = yield* withTempDir
      const sourceFile = path.join(workspace, "downloads", "Example.Movie.2026.720p.HDTV.mkv")
      yield* writeMediaFile(sourceFile, "downgrade")
      const { movieId, profileId } = yield* seedMovie(path.join(workspace, "library"), 18)

      const db = yield* Db
      yield* db
        .update(qualityProfiles)
        .set({ upgradeAllowed: true })
        .where(eq(qualityProfiles.id, profileId))
      yield* db.insert(qualityItems).values({
        profileId,
        qualityName: "HDTV720p",
        weight: 20,
        allowed: true,
      })
      yield* db
        .update(movies)
        .set({
          status: "available",
          hasFile: true,
          existingQualityName: "WEBDL1080p",
          existingQualityRank: 40,
          existingFormatScore: 0,
        })
        .where(eq(movies.id, movieId))

      const importer = yield* MediaImportService
      const error = yield* Effect.flip(
        importer.importMovie({
          movieId,
          sourcePath: sourceFile,
          releaseTitle: "Example.Movie.2026.720p.HDTV-GRP",
        }),
      )

      expect(error._tag).toBe("MediaImportError")
      if (error._tag === "MediaImportError") {
        expect(error.reason).toBe("upgrade_rejected")
      }
    }).pipe(Effect.provide(TestLayer)),
  )
})
