/**
 * Hardcoded quality profile bundles inspired by TRaSH Guides.
 * Each bundle defines quality items, custom formats, and format scores
 * that can be applied to a profile as a starting point.
 */
import type { QualityName, SpecField } from './quality'

export interface BundleQualityItem {
  readonly qualityName: QualityName | null
  readonly groupName: string | null
  readonly weight: number
  readonly allowed: boolean
}

export interface BundleCustomFormat {
  readonly name: string
  readonly includeWhenRenaming: boolean
  readonly specs: ReadonlyArray<{
    readonly name: string
    readonly field: SpecField
    readonly pattern: string
    readonly negate: boolean
    readonly required: boolean
  }>
}

export interface BundleFormatScore {
  readonly formatName: string
  readonly score: number
}

export interface Bundle {
  readonly id: string
  readonly name: string
  readonly version: number
  readonly description: string
  readonly upgradeAllowed: boolean
  readonly minFormatScore: number
  readonly cutoffFormatScore: number
  readonly minUpgradeFormatScore: number
  readonly qualityItems: ReadonlyArray<BundleQualityItem>
  readonly customFormats: ReadonlyArray<BundleCustomFormat>
  readonly formatScores: ReadonlyArray<BundleFormatScore>
}

/** Shared custom formats used across bundles. */
const SHARED_FORMATS: ReadonlyArray<BundleCustomFormat> = [
  {
    name: 'BR-DISK',
    includeWhenRenaming: false,
    specs: [
      { name: 'BR-DISK', field: 'qualityModifier', pattern: 'brdisk', negate: false, required: true },
    ],
  },
  {
    name: 'LQ',
    includeWhenRenaming: false,
    specs: [
      { name: 'CAM', field: 'source', pattern: 'cam', negate: false, required: false },
      { name: 'TELESYNC', field: 'source', pattern: 'telesync', negate: false, required: false },
      { name: 'TELECINE', field: 'source', pattern: 'telecine', negate: false, required: false },
      { name: 'WORKPRINT', field: 'source', pattern: 'workprint', negate: false, required: false },
      { name: 'DVDSCR', field: 'qualityModifier', pattern: 'screener', negate: false, required: false },
      { name: 'REGIONAL', field: 'qualityModifier', pattern: 'regional', negate: false, required: false },
    ],
  },
  {
    name: 'x264',
    includeWhenRenaming: false,
    specs: [
      { name: 'x264', field: 'releaseTitle', pattern: '[xh]\\.?264', negate: false, required: true },
    ],
  },
  {
    name: 'x265/HEVC',
    includeWhenRenaming: false,
    specs: [
      { name: 'x265/HEVC', field: 'releaseTitle', pattern: '[xh]\\.?265|hevc', negate: false, required: true },
    ],
  },
  {
    name: 'Remux',
    includeWhenRenaming: false,
    specs: [
      { name: 'Remux', field: 'qualityModifier', pattern: 'remux', negate: false, required: true },
    ],
  },
]

const HD_BLURAY_WEB_1080P: Bundle = {
  id: 'trash-hd-bluray-web-1080p',
  name: 'HD Bluray + WEB (1080p)',
  version: 1,
  description: 'TRaSH-inspired 1080p profile preferring Bluray and WEB sources with x265 preference.',
  upgradeAllowed: true,
  minFormatScore: 0,
  cutoffFormatScore: 10000,
  minUpgradeFormatScore: 1,
  qualityItems: [
    // Group: WEB 1080p
    { qualityName: null,           groupName: 'WEB 1080p', weight: 1, allowed: true },
    { qualityName: 'WEBDL1080p',   groupName: 'WEB 1080p', weight: 2, allowed: true },
    { qualityName: 'WEBRip1080p',  groupName: 'WEB 1080p', weight: 3, allowed: true },
    // Standalone
    { qualityName: 'Bluray1080p',  groupName: null,         weight: 4, allowed: true },
    { qualityName: 'Remux1080p',   groupName: null,         weight: 5, allowed: true },
  ],
  customFormats: SHARED_FORMATS,
  formatScores: [
    { formatName: 'BR-DISK',    score: -10000 },
    { formatName: 'LQ',         score: -10000 },
    { formatName: 'x264',       score: 50 },
    { formatName: 'x265/HEVC',  score: 100 },
    { formatName: 'Remux',      score: 1500 },
  ],
}

const UHD_BLURAY_WEB_2160P: Bundle = {
  id: 'trash-uhd-bluray-web-2160p',
  name: 'UHD Bluray + WEB (2160p)',
  version: 1,
  description: 'TRaSH-inspired 2160p profile preferring Bluray and WEB sources with HDR preference.',
  upgradeAllowed: true,
  minFormatScore: 0,
  cutoffFormatScore: 10000,
  minUpgradeFormatScore: 1,
  qualityItems: [
    // Group: WEB 2160p
    { qualityName: null,           groupName: 'WEB 2160p', weight: 1, allowed: true },
    { qualityName: 'WEBDL2160p',   groupName: 'WEB 2160p', weight: 2, allowed: true },
    { qualityName: 'WEBRip2160p',  groupName: 'WEB 2160p', weight: 3, allowed: true },
    // Standalone
    { qualityName: 'Bluray2160p',  groupName: null,         weight: 4, allowed: true },
    { qualityName: 'Remux2160p',   groupName: null,         weight: 5, allowed: true },
  ],
  customFormats: SHARED_FORMATS,
  formatScores: [
    { formatName: 'BR-DISK',    score: -10000 },
    { formatName: 'LQ',         score: -10000 },
    { formatName: 'x264',       score: 0 },
    { formatName: 'x265/HEVC',  score: 100 },
    { formatName: 'Remux',      score: 1500 },
  ],
}

/** All available bundles keyed by id. */
export const BUNDLES: ReadonlyMap<string, Bundle> = new Map([
  [HD_BLURAY_WEB_1080P.id, HD_BLURAY_WEB_1080P],
  [UHD_BLURAY_WEB_2160P.id, UHD_BLURAY_WEB_2160P],
])

/** Ordered list for display. First entry is used as seed default. */
export const BUNDLE_LIST: ReadonlyArray<Bundle> = [HD_BLURAY_WEB_1080P, UHD_BLURAY_WEB_2160P]
