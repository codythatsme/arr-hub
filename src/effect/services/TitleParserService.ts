import { Context, Effect, Layer } from "effect"

import type { QualityModifier, QualityName, QualitySource } from "#/effect/domain/quality"
import type { ParsedTitle } from "#/effect/domain/release"
import { ParseFailed } from "#/effect/errors"

// ── Regex patterns (informed by Radarr QualityParser.cs + Sonarr Parser.cs) ──

const SEASON_EPISODE = /S(\d{1,2})E(\d{1,3})/i
const SEASON_EPISODE_ALT = /(\d{1,2})x(\d{2,3})/i

const YEAR_RE = /(?:^|[.\-_ (])((?:19|20)\d{2})(?=[.\-_ )]|$)/

const RESOLUTION_RE = /(?:^|[.\-_ ])(2160|1080|720|480|576)[pi]?(?=[.\-_ ]|$)/i

const SOURCE_PATTERNS: ReadonlyArray<readonly [RegExp, QualitySource]> = [
  [/(?:^|[.\-_ ])blu[-.]?ray(?=[.\-_ ]|$)/i, "bluray"],
  [/(?:^|[.\-_ ])web[-.]?dl(?=[.\-_ ]|$)/i, "webdl"],
  [/(?:^|[.\-_ ])web[-.]?rip(?=[.\-_ ]|$)/i, "webrip"],
  [/(?:^|[.\-_ ])web(?![-.]?(?:dl|rip))(?=[.\-_ ]|$)/i, "webdl"],
  [/(?:^|[.\-_ ])hdtv(?=[.\-_ ]|$)/i, "tv"],
  [/(?:^|[.\-_ ])pdtv(?=[.\-_ ]|$)/i, "tv"],
  [/(?:^|[.\-_ ])dvd(?!scr)(?=[.\-_ ]|$)/i, "dvd"],
  [/(?:^|[.\-_ ])cam(?=[.\-_ ]|$)/i, "cam"],
  [/(?:^|[.\-_ ])(?:telesync|ts(?![-.]?rip))(?=[.\-_ ]|$)/i, "telesync"],
  [/(?:^|[.\-_ ])telecine(?=[.\-_ ]|$)/i, "telecine"],
  [/(?:^|[.\-_ ])workprint(?=[.\-_ ]|$)/i, "workprint"],
]

const MODIFIER_PATTERNS: ReadonlyArray<readonly [RegExp, QualityModifier]> = [
  [/\bremux\b/i, "remux"],
  [/\b(?:screener|dvdscr)\b/i, "screener"],
  [/\b(?:brdisk|bd[-.]?disk)\b/i, "brdisk"],
  [/\brawhd\b/i, "rawhd"],
]

const CODEC_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b[xh][.-]?264\b/i, "x264"],
  [/\b(?:[xh][.-]?265|hevc)\b/i, "x265"],
  [/\bav1\b/i, "av1"],
  [/\bxvid\b/i, "xvid"],
  [/\bdivx\b/i, "divx"],
]

const EDITION_RE =
  /(?:^|[.\-_ ])(director'?s?[.\-_ ]?cut|extended|unrated|theatrical|remastered|imax|criterion)(?=[.\-_ ]|$)/i

const RELEASE_GROUP_RE = /-(\w+)$/

const PROPER_RE = /\b(?:proper|repack)\b/i

/**
 * Find the first occurrence of any quality-related token in the title string.
 * Everything before that index is the "title" portion.
 */
function findFirstQualityTokenIndex(raw: string): number {
  const allPatterns: ReadonlyArray<RegExp> = [
    RESOLUTION_RE,
    ...SOURCE_PATTERNS.map(([re]) => re),
    ...MODIFIER_PATTERNS.map(([re]) => re),
    ...CODEC_PATTERNS.map(([re]) => re),
    PROPER_RE,
    EDITION_RE,
    SEASON_EPISODE,
    SEASON_EPISODE_ALT,
  ]

  let earliest = raw.length
  for (const re of allPatterns) {
    const m = re.exec(raw)
    if (m && m.index < earliest) {
      earliest = m.index
    }
  }
  return earliest
}

function matchFirst<T>(raw: string, patterns: ReadonlyArray<readonly [RegExp, T]>): T | null {
  for (const [re, value] of patterns) {
    if (re.test(raw)) return value
  }
  return null
}

/**
 * Resolve a QualityName from (source, resolution, modifier) matching Radarr's
 * source→resolution mapping hierarchy.
 */
function resolveQualityName(
  source: QualitySource | null,
  resolution: number | null,
  modifier: QualityModifier | null,
): QualityName | null {
  if (modifier === "brdisk") return "BRDISK"
  if (modifier === "rawhd") return "RAWHD"
  if (modifier === "screener") return "DVDSCR"

  if (modifier === "remux") {
    if (resolution === 2160) return "Remux2160p"
    if (resolution === 1080) return "Remux1080p"
    // Remux without matching resolution — fall through
    if (resolution) return resolution >= 2160 ? "Remux2160p" : "Remux1080p"
    return "Remux1080p"
  }

  if (!source) {
    // No source — try resolution-only guesses
    if (resolution === 2160) return "HDTV2160p"
    if (resolution === 1080) return "HDTV1080p"
    if (resolution === 720) return "HDTV720p"
    if (resolution === 480) return "SDTV"
    return null
  }

  switch (source) {
    case "cam":
      return "CAM"
    case "telesync":
      return "TELESYNC"
    case "telecine":
      return "TELECINE"
    case "workprint":
      return "WORKPRINT"
    case "dvd":
      return resolution === 480 || !resolution ? "DVD" : "DVD"
    case "tv":
      if (resolution === 2160) return "HDTV2160p"
      if (resolution === 1080) return "HDTV1080p"
      if (resolution === 720) return "HDTV720p"
      return "SDTV"
    case "webdl":
      if (resolution === 2160) return "WEBDL2160p"
      if (resolution === 1080) return "WEBDL1080p"
      if (resolution === 720) return "WEBDL720p"
      if (resolution === 480) return "WEBDL480p"
      return "WEBDL480p"
    case "webrip":
      if (resolution === 2160) return "WEBRip2160p"
      if (resolution === 1080) return "WEBRip1080p"
      if (resolution === 720) return "WEBRip720p"
      if (resolution === 480) return "WEBRip480p"
      return "WEBRip480p"
    case "bluray":
      if (resolution === 2160) return "Bluray2160p"
      if (resolution === 1080) return "Bluray1080p"
      if (resolution === 720) return "Bluray720p"
      if (resolution === 576) return "Bluray576p"
      if (resolution === 480) return "Bluray480p"
      return "Bluray480p"
    case "unknown":
      return "Unknown"
  }
}

// ── Service ──

export class TitleParserService extends Context.Tag("@arr-hub/TitleParserService")<
  TitleParserService,
  {
    readonly parse: (title: string) => Effect.Effect<ParsedTitle, ParseFailed>
  }
>() {}

export const TitleParserServiceLive = Layer.succeed(TitleParserService, {
  parse: (raw: string) =>
    Effect.gen(function* () {
      const trimmed = raw.trim()
      if (trimmed.length === 0) {
        return yield* new ParseFailed({ title: raw, message: "empty title" })
      }

      // Strip file extension for group detection
      const withoutExt = trimmed.replace(/\.\w{2,4}$/, "")

      // Season/Episode
      let season: number | null = null
      let episode: number | null = null
      const seMatch = SEASON_EPISODE.exec(trimmed)
      if (seMatch) {
        season = parseInt(seMatch[1], 10)
        episode = parseInt(seMatch[2], 10)
      } else {
        const altMatch = SEASON_EPISODE_ALT.exec(trimmed)
        if (altMatch) {
          season = parseInt(altMatch[1], 10)
          episode = parseInt(altMatch[2], 10)
        }
      }

      // Year (avoid matching resolutions)
      let year: number | null = null
      const yearMatch = YEAR_RE.exec(trimmed)
      if (yearMatch) {
        const candidate = parseInt(yearMatch[1], 10)
        // Don't treat resolution values as years
        if (candidate !== 2160 && candidate !== 1080 && candidate !== 720 && candidate !== 480) {
          year = candidate
        }
      }

      // Resolution
      let resolution: number | null = null
      const resMatch = RESOLUTION_RE.exec(trimmed)
      if (resMatch) {
        resolution = parseInt(resMatch[1], 10)
      }

      // Source
      const source = matchFirst(trimmed, SOURCE_PATTERNS)

      // Modifier
      const modifier = matchFirst(trimmed, MODIFIER_PATTERNS)

      // Codec
      const codec = matchFirst(trimmed, CODEC_PATTERNS)

      // Edition
      const editionMatch = EDITION_RE.exec(trimmed)
      const edition = editionMatch ? editionMatch[1].replace(/[._-]/g, " ").toLowerCase() : null

      // Release group — last -WORD before file extension
      const groupMatch = RELEASE_GROUP_RE.exec(withoutExt)
      const releaseGroup = groupMatch ? groupMatch[1] : null

      // PROPER/REPACK
      const proper = PROPER_RE.test(trimmed)

      // Title: everything before first quality token, dots/underscores → spaces
      const qualityIdx = findFirstQualityTokenIndex(trimmed)
      // Also consider year position as title boundary
      let titleEnd = qualityIdx
      if (yearMatch && yearMatch.index < titleEnd) {
        titleEnd = yearMatch.index
      }
      const rawTitle = trimmed
        .slice(0, titleEnd)
        .replace(/[._]/g, " ")
        .replace(/-/g, " ")
        .replace(/\s+/g, " ")
        .trim()

      const title = rawTitle || trimmed.split(/[.\-_ ]/)[0] || trimmed

      // Resolve quality name
      const qualityName = resolveQualityName(source, resolution, modifier)

      return {
        title,
        year,
        season,
        episode,
        resolution,
        source,
        modifier,
        codec,
        releaseGroup,
        edition,
        proper,
        qualityName,
      }
    }),
})
