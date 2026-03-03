import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import { TitleParserService, TitleParserServiceLive } from "./TitleParserService"

const TestLayer = TitleParserServiceLive

describe("TitleParserService", () => {
  // ── Movies ──

  it.effect("parses movie: bluray 1080p", () =>
    Effect.gen(function* () {
      const svc = yield* TitleParserService
      const p = yield* svc.parse("The.Matrix.1999.1080p.BluRay.x264-GROUP")
      expect(p.title).toBe("The Matrix")
      expect(p.year).toBe(1999)
      expect(p.resolution).toBe(1080)
      expect(p.source).toBe("bluray")
      expect(p.codec).toBe("x264")
      expect(p.releaseGroup).toBe("GROUP")
      expect(p.qualityName).toBe("Bluray1080p")
      expect(p.season).toBeNull()
      expect(p.episode).toBeNull()
    }).pipe(Effect.provide(TestLayer)),
  )

  // ── TV ──

  it.effect("parses TV: S##E## HDTV 720p", () =>
    Effect.gen(function* () {
      const svc = yield* TitleParserService
      const p = yield* svc.parse("Show.S03E12.720p.HDTV.x264-LOL")
      expect(p.title).toBe("Show")
      expect(p.season).toBe(3)
      expect(p.episode).toBe(12)
      expect(p.resolution).toBe(720)
      expect(p.source).toBe("tv")
      expect(p.qualityName).toBe("HDTV720p")
      expect(p.releaseGroup).toBe("LOL")
    }).pipe(Effect.provide(TestLayer)),
  )

  // ── 4K WEB-DL ──

  it.effect("parses 4K WEB-DL", () =>
    Effect.gen(function* () {
      const svc = yield* TitleParserService
      const p = yield* svc.parse("Movie.2024.2160p.WEB-DL.x265-GRP")
      expect(p.year).toBe(2024)
      expect(p.resolution).toBe(2160)
      expect(p.source).toBe("webdl")
      expect(p.codec).toBe("x265")
      expect(p.qualityName).toBe("WEBDL2160p")
    }).pipe(Effect.provide(TestLayer)),
  )

  // ── Remux ──

  it.effect("parses remux 2160p", () =>
    Effect.gen(function* () {
      const svc = yield* TitleParserService
      const p = yield* svc.parse("Movie.2023.REMUX.2160p.BluRay-FraMeSToR")
      expect(p.modifier).toBe("remux")
      expect(p.resolution).toBe(2160)
      expect(p.qualityName).toBe("Remux2160p")
      expect(p.releaseGroup).toBe("FraMeSToR")
    }).pipe(Effect.provide(TestLayer)),
  )

  // ── Low quality ──

  it.effect("parses CAM", () =>
    Effect.gen(function* () {
      const svc = yield* TitleParserService
      const p = yield* svc.parse("Movie.CAM.2024")
      expect(p.source).toBe("cam")
      expect(p.qualityName).toBe("CAM")
    }).pipe(Effect.provide(TestLayer)),
  )

  // ── WEBRip ──

  it.effect("parses WEBRip 1080p", () =>
    Effect.gen(function* () {
      const svc = yield* TitleParserService
      const p = yield* svc.parse("Some.Movie.2022.1080p.WEBRip.x264-RARBG")
      expect(p.source).toBe("webrip")
      expect(p.resolution).toBe(1080)
      expect(p.qualityName).toBe("WEBRip1080p")
    }).pipe(Effect.provide(TestLayer)),
  )

  // ── Edge cases ──

  it.effect("handles underscores as separators", () =>
    Effect.gen(function* () {
      const svc = yield* TitleParserService
      const p = yield* svc.parse("My_Movie_2020_720p_BluRay_x264-GRP")
      expect(p.title).toBe("My Movie")
      expect(p.year).toBe(2020)
      expect(p.resolution).toBe(720)
      expect(p.qualityName).toBe("Bluray720p")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("handles no release group", () =>
    Effect.gen(function* () {
      const svc = yield* TitleParserService
      const p = yield* svc.parse("Movie.2019.1080p.BluRay")
      expect(p.releaseGroup).toBeNull()
      expect(p.qualityName).toBe("Bluray1080p")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("detects PROPER", () =>
    Effect.gen(function* () {
      const svc = yield* TitleParserService
      const p = yield* svc.parse("Show.S01E01.PROPER.720p.HDTV.x264-GRP")
      expect(p.proper).toBe(true)
      expect(p.qualityName).toBe("HDTV720p")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("detects REPACK", () =>
    Effect.gen(function* () {
      const svc = yield* TitleParserService
      const p = yield* svc.parse("Show.S02E05.REPACK.1080p.WEB-DL-GRP")
      expect(p.proper).toBe(true)
      expect(p.source).toBe("webdl")
      expect(p.qualityName).toBe("WEBDL1080p")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("detects edition", () =>
    Effect.gen(function* () {
      const svc = yield* TitleParserService
      const p = yield* svc.parse("Movie.2001.Directors.Cut.1080p.BluRay.x264-GRP")
      expect(p.edition).toBe("directors cut")
      expect(p.qualityName).toBe("Bluray1080p")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("parses HEVC as x265", () =>
    Effect.gen(function* () {
      const svc = yield* TitleParserService
      const p = yield* svc.parse("Movie.2022.2160p.BluRay.HEVC-GRP")
      expect(p.codec).toBe("x265")
      expect(p.qualityName).toBe("Bluray2160p")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("parses AV1 codec", () =>
    Effect.gen(function* () {
      const svc = yield* TitleParserService
      const p = yield* svc.parse("Movie.2023.1080p.WEB-DL.AV1-GRP")
      expect(p.codec).toBe("av1")
    }).pipe(Effect.provide(TestLayer)),
  )

  // ── Alternate season/episode formats ──

  it.effect("parses 1x01 format", () =>
    Effect.gen(function* () {
      const svc = yield* TitleParserService
      const p = yield* svc.parse("Show.1x05.720p.HDTV-GRP")
      expect(p.season).toBe(1)
      expect(p.episode).toBe(5)
    }).pipe(Effect.provide(TestLayer)),
  )

  // ── Quality resolution combos ──

  it.effect("SDTV (no resolution + tv source)", () =>
    Effect.gen(function* () {
      const svc = yield* TitleParserService
      const p = yield* svc.parse("Show.S01E01.HDTV-GRP")
      expect(p.qualityName).toBe("SDTV")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("WEBDL 480p", () =>
    Effect.gen(function* () {
      const svc = yield* TitleParserService
      const p = yield* svc.parse("Movie.2020.480p.WEB-DL-GRP")
      expect(p.qualityName).toBe("WEBDL480p")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("Remux 1080p", () =>
    Effect.gen(function* () {
      const svc = yield* TitleParserService
      const p = yield* svc.parse("Movie.2020.Remux.1080p.BluRay-GRP")
      expect(p.qualityName).toBe("Remux1080p")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("HDTV 2160p", () =>
    Effect.gen(function* () {
      const svc = yield* TitleParserService
      const p = yield* svc.parse("Show.S01E01.2160p.HDTV-GRP")
      expect(p.qualityName).toBe("HDTV2160p")
    }).pipe(Effect.provide(TestLayer)),
  )

  // ── Error ──

  it.effect("rejects empty title", () =>
    Effect.gen(function* () {
      const svc = yield* TitleParserService
      const err = yield* Effect.flip(svc.parse(""))
      expect(err._tag).toBe("ParseFailed")
    }).pipe(Effect.provide(TestLayer)),
  )
})
