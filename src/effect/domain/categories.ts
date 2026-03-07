/**
 * Standard Torznab/Newznab category definitions.
 * Parent categories are multiples of 1000.
 * Sub-categories are parent + offset.
 */

export interface CategoryDef {
  readonly id: number
  readonly name: string
  readonly parentId: number | null
}

/** Standard category tree — matches Prowlarr's Categories.cs */
export const CATEGORIES: ReadonlyArray<CategoryDef> = [
  // Console/Gaming
  { id: 1000, name: "Console", parentId: null },
  { id: 1010, name: "Console/NDS", parentId: 1000 },
  { id: 1020, name: "Console/PSP", parentId: 1000 },
  { id: 1030, name: "Console/Wii", parentId: 1000 },
  { id: 1040, name: "Console/Xbox", parentId: 1000 },
  { id: 1050, name: "Console/Xbox 360", parentId: 1000 },
  { id: 1060, name: "Console/Wiiware", parentId: 1000 },
  { id: 1070, name: "Console/Xbox 360 DLC", parentId: 1000 },
  { id: 1080, name: "Console/PS3", parentId: 1000 },
  { id: 1090, name: "Console/Other", parentId: 1000 },
  { id: 1110, name: "Console/3DS", parentId: 1000 },
  { id: 1120, name: "Console/PS Vita", parentId: 1000 },
  { id: 1130, name: "Console/WiiU", parentId: 1000 },
  { id: 1140, name: "Console/Xbox One", parentId: 1000 },
  { id: 1180, name: "Console/PS4", parentId: 1000 },

  // Movies
  { id: 2000, name: "Movies", parentId: null },
  { id: 2010, name: "Movies/Foreign", parentId: 2000 },
  { id: 2020, name: "Movies/Other", parentId: 2000 },
  { id: 2030, name: "Movies/SD", parentId: 2000 },
  { id: 2040, name: "Movies/HD", parentId: 2000 },
  { id: 2045, name: "Movies/UHD", parentId: 2000 },
  { id: 2050, name: "Movies/BluRay", parentId: 2000 },
  { id: 2060, name: "Movies/3D", parentId: 2000 },
  { id: 2070, name: "Movies/DVD", parentId: 2000 },
  { id: 2080, name: "Movies/WEB-DL", parentId: 2000 },

  // Audio
  { id: 3000, name: "Audio", parentId: null },
  { id: 3010, name: "Audio/MP3", parentId: 3000 },
  { id: 3020, name: "Audio/Video", parentId: 3000 },
  { id: 3030, name: "Audio/Audiobook", parentId: 3000 },
  { id: 3040, name: "Audio/Lossless", parentId: 3000 },
  { id: 3050, name: "Audio/Other", parentId: 3000 },
  { id: 3060, name: "Audio/Foreign", parentId: 3000 },

  // PC
  { id: 4000, name: "PC", parentId: null },
  { id: 4010, name: "PC/0day", parentId: 4000 },
  { id: 4020, name: "PC/ISO", parentId: 4000 },
  { id: 4030, name: "PC/Mac", parentId: 4000 },
  { id: 4040, name: "PC/Phone-Other", parentId: 4000 },
  { id: 4050, name: "PC/Games", parentId: 4000 },
  { id: 4060, name: "PC/Phone-IOS", parentId: 4000 },
  { id: 4070, name: "PC/Phone-Android", parentId: 4000 },

  // TV
  { id: 5000, name: "TV", parentId: null },
  { id: 5020, name: "TV/Foreign", parentId: 5000 },
  { id: 5030, name: "TV/SD", parentId: 5000 },
  { id: 5040, name: "TV/HD", parentId: 5000 },
  { id: 5045, name: "TV/UHD", parentId: 5000 },
  { id: 5050, name: "TV/Other", parentId: 5000 },
  { id: 5060, name: "TV/Sport", parentId: 5000 },
  { id: 5070, name: "TV/Anime", parentId: 5000 },
  { id: 5080, name: "TV/Documentary", parentId: 5000 },

  // XXX (included for completeness/filtering)
  { id: 6000, name: "XXX", parentId: null },
  { id: 6010, name: "XXX/DVD", parentId: 6000 },
  { id: 6020, name: "XXX/WMV", parentId: 6000 },
  { id: 6030, name: "XXX/XviD", parentId: 6000 },
  { id: 6040, name: "XXX/x264", parentId: 6000 },
  { id: 6050, name: "XXX/Pack", parentId: 6000 },
  { id: 6060, name: "XXX/ImageSet", parentId: 6000 },
  { id: 6070, name: "XXX/Other", parentId: 6000 },
  { id: 6080, name: "XXX/SD", parentId: 6000 },
  { id: 6090, name: "XXX/WEB-DL", parentId: 6000 },

  // Books
  { id: 7000, name: "Books", parentId: null },
  { id: 7010, name: "Books/Mags", parentId: 7000 },
  { id: 7020, name: "Books/EBook", parentId: 7000 },
  { id: 7030, name: "Books/Comics", parentId: 7000 },
  { id: 7040, name: "Books/Technical", parentId: 7000 },
  { id: 7050, name: "Books/Other", parentId: 7000 },
  { id: 7060, name: "Books/Foreign", parentId: 7000 },

  // Other
  { id: 8000, name: "Other", parentId: null },
  { id: 8010, name: "Other/Misc", parentId: 8000 },
  { id: 8020, name: "Other/Hashed", parentId: 8000 },
]

// ── Lookup maps ──

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]))

/** Look up a category by its standard ID. */
export function getCategoryById(id: number): CategoryDef | undefined {
  return BY_ID.get(id)
}

/** Get the parent category for a sub-category, or itself if already a parent. */
export function getParentCategory(id: number): CategoryDef | undefined {
  const cat = BY_ID.get(id)
  if (!cat) return undefined
  if (cat.parentId === null) return cat
  return BY_ID.get(cat.parentId)
}

/** Check if a category ID belongs to (or is) a given parent category. */
export function isInCategory(categoryId: number, parentId: number): boolean {
  if (categoryId === parentId) return true
  const cat = BY_ID.get(categoryId)
  return cat?.parentId === parentId
}

/** All standard movie category IDs (2000-2080). */
export const MOVIE_CATEGORIES: ReadonlyArray<number> = CATEGORIES.filter(
  (c) => c.id === 2000 || c.parentId === 2000,
).map((c) => c.id)

/** All standard TV category IDs (5000-5080). */
export const TV_CATEGORIES: ReadonlyArray<number> = CATEGORIES.filter(
  (c) => c.id === 5000 || c.parentId === 5000,
).map((c) => c.id)

/**
 * Normalize a category string from a release to a standard category ID.
 * Returns the numeric ID if it's a valid standard category, null otherwise.
 */
export function normalizeCategory(category: string): number | null {
  const id = Number(category)
  if (Number.isNaN(id)) return null
  if (BY_ID.has(id)) return id
  return null
}
