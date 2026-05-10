import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { createTorrentBlackholeAdapter, createUsenetBlackholeAdapter } from "./BlackholeAdapter"

async function makeWorkspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "arr-hub-blackhole-"))
  return {
    root,
    blackholeFolder: path.join(root, "incoming"),
    watchFolder: path.join(root, "watch"),
  }
}

describe("BlackholeAdapter", () => {
  it("writes torrent files and scans completed watch-folder items with stable ids", async () => {
    const workspace = await makeWorkspace()
    try {
      const sourcePath = path.join(workspace.root, "Example.Movie.2026.torrent")
      const completedPath = path.join(workspace.watchFolder, "Example.Movie.2026.mkv")
      await writeFile(sourcePath, "torrent-bytes", "utf8")

      const adapter = createTorrentBlackholeAdapter({
        id: 1,
        name: "Torrent Blackhole",
        type: "torrent_blackhole",
        host: "localhost",
        port: 1,
        username: "",
        password: "",
        useSsl: false,
        category: null,
        settings: {
          pollIntervalMs: 30_000,
          blackholeFolder: workspace.blackholeFolder,
          watchFolder: workspace.watchFolder,
          watchGracePeriodSeconds: 0,
        },
      })

      const health = await Effect.runPromise(adapter.testConnection())
      const externalId = await Effect.runPromise(
        adapter.addDownload(pathToFileURL(sourcePath).toString()),
      )
      await writeFile(completedPath, "movie", "utf8")
      const queue = await Effect.runPromise(adapter.getQueue())

      const removeError = await Effect.runPromise(
        Effect.flip(adapter.removeDownload(externalId, false)),
      )
      await Effect.runPromise(adapter.removeDownload(externalId, true))

      expect(health.connected).toBe(true)
      expect(removeError).toMatchObject({
        _tag: "DownloadClientError",
        reason: "download_rejected",
      })
      await expect(
        readFile(path.join(workspace.blackholeFolder, "Example.Movie.2026.torrent"), "utf8"),
      ).resolves.toBe("torrent-bytes")
      expect(queue).toEqual([
        {
          externalId,
          title: "Example.Movie.2026",
          status: "completed",
          sizeBytes: 5,
          progressFraction: 1,
          etaSeconds: null,
          errorMessage: null,
          outputPath: completedPath,
          downloadClientId: 1,
        },
      ])
      await expect(access(completedPath)).rejects.toThrow()
    } finally {
      await rm(workspace.root, { recursive: true, force: true })
    }
  })

  it("writes NZB files and only allows magnets for configured torrent blackholes", async () => {
    const workspace = await makeWorkspace()
    try {
      const sourcePath = path.join(workspace.root, "Example.Show.S01E01.nzb")
      await writeFile(sourcePath, "<nzb />", "utf8")

      const usenet = createUsenetBlackholeAdapter({
        id: 2,
        name: "Usenet Blackhole",
        type: "usenet_blackhole",
        host: "localhost",
        port: 1,
        username: "",
        password: "",
        useSsl: false,
        category: null,
        settings: {
          pollIntervalMs: 30_000,
          blackholeFolder: workspace.blackholeFolder,
          watchFolder: workspace.watchFolder,
        },
      })

      const torrent = createTorrentBlackholeAdapter({
        id: 3,
        name: "Torrent Blackhole",
        type: "torrent_blackhole",
        host: "localhost",
        port: 1,
        username: "",
        password: "",
        useSsl: false,
        category: null,
        settings: {
          pollIntervalMs: 30_000,
          blackholeFolder: workspace.blackholeFolder,
          watchFolder: workspace.watchFolder,
          saveMagnetFiles: true,
          magnetFileExtension: ".magnet",
        },
      })

      await Effect.runPromise(usenet.addDownload(pathToFileURL(sourcePath).toString()))
      const magnetError = await Effect.runPromise(
        Effect.flip(usenet.addDownload("magnet:?xt=urn:btih:abc&dn=Example.Show.S01E02")),
      )
      expect(magnetError).toMatchObject({
        _tag: "DownloadClientError",
        reason: "download_rejected",
      })
      await Effect.runPromise(torrent.addDownload("magnet:?xt=urn:btih:abc&dn=Example.Show.S01E02"))

      await expect(
        readFile(path.join(workspace.blackholeFolder, "Example.Show.S01E01.nzb"), "utf8"),
      ).resolves.toBe("<nzb />")
      await expect(
        readFile(path.join(workspace.blackholeFolder, "Example.Show.S01E02.magnet"), "utf8"),
      ).resolves.toBe("magnet:?xt=urn:btih:abc&dn=Example.Show.S01E02")
    } finally {
      await rm(workspace.root, { recursive: true, force: true })
    }
  })
})
