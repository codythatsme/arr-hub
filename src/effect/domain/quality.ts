/**
 * Canonical quality definitions mirroring Radarr's Quality.cs.
 * Each entry maps 1:1 with NzbDrone.Core.Qualities.Quality static properties.
 */

export type QualitySource =
  | "unknown"
  | "cam"
  | "telesync"
  | "telecine"
  | "workprint"
  | "dvd"
  | "tv"
  | "webdl"
  | "webrip"
  | "bluray"

export type QualityModifier = "none" | "remux" | "screener" | "regional" | "brdisk" | "rawhd"

interface QualityDef {
  readonly id: number
  readonly name: string
  readonly source: QualitySource
  readonly resolution: number
  readonly modifier: QualityModifier
}

/** All 31 Radarr qualities, keyed by canonical name. */
export const Quality = {
  Unknown: { id: 0, name: "Unknown", source: "unknown", resolution: 0, modifier: "none" },
  WORKPRINT: { id: 24, name: "WORKPRINT", source: "workprint", resolution: 0, modifier: "none" },
  CAM: { id: 25, name: "CAM", source: "cam", resolution: 0, modifier: "none" },
  TELESYNC: { id: 26, name: "TELESYNC", source: "telesync", resolution: 0, modifier: "none" },
  TELECINE: { id: 27, name: "TELECINE", source: "telecine", resolution: 0, modifier: "none" },
  DVDSCR: { id: 28, name: "DVDSCR", source: "dvd", resolution: 480, modifier: "screener" },
  REGIONAL: { id: 29, name: "REGIONAL", source: "dvd", resolution: 480, modifier: "regional" },
  SDTV: { id: 1, name: "SDTV", source: "tv", resolution: 480, modifier: "none" },
  DVD: { id: 2, name: "DVD", source: "dvd", resolution: 0, modifier: "none" },
  DVDR: { id: 23, name: "DVD-R", source: "dvd", resolution: 480, modifier: "remux" },
  HDTV720p: { id: 4, name: "HDTV-720p", source: "tv", resolution: 720, modifier: "none" },
  HDTV1080p: { id: 9, name: "HDTV-1080p", source: "tv", resolution: 1080, modifier: "none" },
  HDTV2160p: { id: 16, name: "HDTV-2160p", source: "tv", resolution: 2160, modifier: "none" },
  WEBDL480p: { id: 8, name: "WEBDL-480p", source: "webdl", resolution: 480, modifier: "none" },
  WEBDL720p: { id: 5, name: "WEBDL-720p", source: "webdl", resolution: 720, modifier: "none" },
  WEBDL1080p: { id: 3, name: "WEBDL-1080p", source: "webdl", resolution: 1080, modifier: "none" },
  WEBDL2160p: { id: 18, name: "WEBDL-2160p", source: "webdl", resolution: 2160, modifier: "none" },
  WEBRip480p: { id: 12, name: "WEBRip-480p", source: "webrip", resolution: 480, modifier: "none" },
  WEBRip720p: { id: 14, name: "WEBRip-720p", source: "webrip", resolution: 720, modifier: "none" },
  WEBRip1080p: {
    id: 15,
    name: "WEBRip-1080p",
    source: "webrip",
    resolution: 1080,
    modifier: "none",
  },
  WEBRip2160p: {
    id: 17,
    name: "WEBRip-2160p",
    source: "webrip",
    resolution: 2160,
    modifier: "none",
  },
  Bluray480p: { id: 20, name: "Bluray-480p", source: "bluray", resolution: 480, modifier: "none" },
  Bluray576p: { id: 21, name: "Bluray-576p", source: "bluray", resolution: 576, modifier: "none" },
  Bluray720p: { id: 6, name: "Bluray-720p", source: "bluray", resolution: 720, modifier: "none" },
  Bluray1080p: {
    id: 7,
    name: "Bluray-1080p",
    source: "bluray",
    resolution: 1080,
    modifier: "none",
  },
  Bluray2160p: {
    id: 19,
    name: "Bluray-2160p",
    source: "bluray",
    resolution: 2160,
    modifier: "none",
  },
  Remux1080p: {
    id: 30,
    name: "Remux-1080p",
    source: "bluray",
    resolution: 1080,
    modifier: "remux",
  },
  Remux2160p: {
    id: 31,
    name: "Remux-2160p",
    source: "bluray",
    resolution: 2160,
    modifier: "remux",
  },
  BRDISK: { id: 22, name: "BR-DISK", source: "bluray", resolution: 1080, modifier: "brdisk" },
  RAWHD: { id: 10, name: "Raw-HD", source: "tv", resolution: 1080, modifier: "rawhd" },
} as const satisfies Record<string, QualityDef>

export type QualityName = keyof typeof Quality

/** All quality names ordered low→high weight (matching Radarr DefaultQualityDefinitions). */
export const DEFAULT_QUALITY_ORDER: ReadonlyArray<QualityName> = [
  "Unknown",
  "WORKPRINT",
  "CAM",
  "TELESYNC",
  "TELECINE",
  "REGIONAL",
  "DVDSCR",
  "SDTV",
  "DVD",
  "DVDR",
  "WEBDL480p",
  "WEBRip480p",
  "Bluray480p",
  "Bluray576p",
  "HDTV720p",
  "WEBDL720p",
  "WEBRip720p",
  "Bluray720p",
  "HDTV1080p",
  "WEBDL1080p",
  "WEBRip1080p",
  "Bluray1080p",
  "Remux1080p",
  "HDTV2160p",
  "WEBDL2160p",
  "WEBRip2160p",
  "Bluray2160p",
  "Remux2160p",
  "BRDISK",
  "RAWHD",
]

/** Fields available for custom format spec matching. */
export type SpecField =
  | "releaseTitle"
  | "releaseGroup"
  | "edition"
  | "source"
  | "resolution"
  | "qualityModifier"
