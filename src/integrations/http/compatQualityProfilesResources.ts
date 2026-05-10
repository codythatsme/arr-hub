import type {
  FormatScoreInput,
  ProfileInput,
  ProfileUpdate,
  ProfileWithDetails,
  QualityItemInput,
} from "#/effect/services/ProfileService"

export interface CompatibleQualityResource {
  readonly id: number
  readonly name: string
}

export interface CompatibleQualityProfileItemResource {
  readonly id: number
  readonly name: string
  readonly quality: CompatibleQualityResource | null
  readonly items: ReadonlyArray<CompatibleQualityProfileItemResource>
  readonly allowed: boolean
  readonly minSize: number | null
  readonly maxSize: number | null
  readonly preferredSize: number | null
}

export interface CompatibleProfileFormatItemResource {
  readonly format: number
  readonly name: string
  readonly score: number
}

export interface CompatibleQualityProfileResource {
  readonly id: number
  readonly name: string
  readonly upgradeAllowed: boolean
  readonly cutoff: number
  readonly items: ReadonlyArray<CompatibleQualityProfileItemResource>
  readonly minFormatScore: number
  readonly cutoffFormatScore: number
  readonly minUpgradeFormatScore: number
  readonly formatItems: ReadonlyArray<CompatibleProfileFormatItemResource>
}

export interface QualityProfileBodyError {
  readonly error: string
}

interface CompatibleQualityProfileBody {
  readonly name?: unknown
  readonly upgradeAllowed?: unknown
  readonly minFormatScore?: unknown
  readonly cutoffFormatScore?: unknown
  readonly minUpgradeFormatScore?: unknown
  readonly isDefault?: unknown
  readonly items?: unknown
  readonly formatItems?: unknown
}

interface CompatibleQualityProfileItemBody {
  readonly id?: unknown
  readonly name?: unknown
  readonly quality?: unknown
  readonly items?: unknown
  readonly allowed?: unknown
}

interface CompatibleProfileFormatItemBody {
  readonly format?: unknown
  readonly score?: unknown
}

type MutableProfileUpdate = {
  -readonly [K in keyof ProfileUpdate]: ProfileUpdate[K]
}

export function qualityProfileResource(
  details: ProfileWithDetails,
  customFormatNames: ReadonlyMap<number, string> = new Map(),
): CompatibleQualityProfileResource {
  const sortedItems = details.qualityItems.toSorted((a, b) => a.weight - b.weight || a.id - b.id)
  const cutoffItem = sortedItems
    .toReversed()
    .find((item) => item.allowed && item.qualityName !== null)

  return {
    id: details.profile.id,
    name: details.profile.name,
    upgradeAllowed: details.profile.upgradeAllowed,
    cutoff: cutoffItem?.id ?? 0,
    items: qualityItemTree(sortedItems),
    minFormatScore: details.profile.minFormatScore,
    cutoffFormatScore: details.profile.cutoffFormatScore,
    minUpgradeFormatScore: details.profile.minUpgradeFormatScore,
    formatItems: details.formatScores
      .toSorted((a, b) => a.customFormatId - b.customFormatId)
      .map((score) => ({
        format: score.customFormatId,
        name:
          customFormatNames.get(score.customFormatId) ?? `Custom Format ${score.customFormatId}`,
        score: score.score,
      })),
  }
}

export function profileInputFromCompatibleResource(
  body: unknown,
): ProfileInput | QualityProfileBodyError {
  const parsed = profileUpdateFromCompatibleResource(body)
  if ("error" in parsed) return parsed
  if (parsed.name === undefined) return { error: "name is required" }
  return parsed as ProfileInput
}

export function profileUpdateFromCompatibleResource(
  body: unknown,
): ProfileUpdate | QualityProfileBodyError {
  if (!isObject(body)) return { error: "profile body is required" }
  const resource = body as CompatibleQualityProfileBody
  const update: MutableProfileUpdate = {}

  if (resource.name !== undefined) {
    if (typeof resource.name !== "string" || resource.name.trim().length === 0) {
      return { error: "name must be a non-empty string" }
    }
    update.name = resource.name
  }
  if (resource.upgradeAllowed !== undefined) {
    if (typeof resource.upgradeAllowed !== "boolean") {
      return { error: "upgradeAllowed must be a boolean" }
    }
    update.upgradeAllowed = resource.upgradeAllowed
  }
  if (resource.minFormatScore !== undefined) {
    const value = numberValue(resource.minFormatScore)
    if (value === null) return { error: "minFormatScore must be a number" }
    update.minFormatScore = value
  }
  if (resource.cutoffFormatScore !== undefined) {
    const value = numberValue(resource.cutoffFormatScore)
    if (value === null) return { error: "cutoffFormatScore must be a number" }
    update.cutoffFormatScore = value
  }
  if (resource.minUpgradeFormatScore !== undefined) {
    const value = numberValue(resource.minUpgradeFormatScore)
    if (value === null || value < 1) return { error: "minUpgradeFormatScore must be at least 1" }
    update.minUpgradeFormatScore = value
  }
  if (resource.isDefault !== undefined) {
    if (typeof resource.isDefault !== "boolean") return { error: "isDefault must be a boolean" }
    update.isDefault = resource.isDefault
  }
  if (resource.items !== undefined) {
    if (!Array.isArray(resource.items)) return { error: "items must be an array" }
    update.qualityItems = qualityItemsFromCompatibleItems(resource.items)
  }
  if (resource.formatItems !== undefined) {
    if (!Array.isArray(resource.formatItems)) return { error: "formatItems must be an array" }
    const scores = formatScoresFromCompatibleItems(resource.formatItems)
    if ("error" in scores) return scores
    update.formatScores = scores
  }

  return update
}

function qualityItemTree(
  items: ReadonlyArray<ProfileWithDetails["qualityItems"][number]>,
): ReadonlyArray<CompatibleQualityProfileItemResource> {
  const groups = new Map<
    string,
    {
      header: ProfileWithDetails["qualityItems"][number] | null
      children: Array<ProfileWithDetails["qualityItems"][number]>
      order: number
    }
  >()
  const roots: Array<{
    order: number
    resource: CompatibleQualityProfileItemResource
  }> = []

  for (const item of items) {
    if (item.qualityName === null && item.groupName !== null) {
      const group = ensureGroup(groups, item.groupName, item.weight)
      group.header = item
      group.order = Math.min(group.order, item.weight)
      continue
    }

    if (item.groupName !== null) {
      const group = ensureGroup(groups, item.groupName, item.weight)
      group.children.push(item)
      group.order = Math.min(group.order, item.weight)
      continue
    }

    roots.push({ order: item.weight, resource: qualityItemResource(item) })
  }

  const grouped = [...groups.entries()].map(([name, group]) => {
    const children = group.children
      .toSorted((a, b) => a.weight - b.weight || a.id - b.id)
      .map((item) => qualityItemResource(item))
    const header = group.header
    return {
      order: group.order,
      resource: {
        id: header?.id ?? children[0]?.id ?? 0,
        name,
        quality: null,
        items: children,
        allowed: header?.allowed ?? children.some((item) => item.allowed),
        minSize: null,
        maxSize: null,
        preferredSize: null,
      },
    }
  })

  return [...roots, ...grouped]
    .toSorted((a, b) => a.order - b.order || a.resource.id - b.resource.id)
    .map((item) => item.resource)
}

function ensureGroup(
  groups: Map<
    string,
    {
      header: ProfileWithDetails["qualityItems"][number] | null
      children: Array<ProfileWithDetails["qualityItems"][number]>
      order: number
    }
  >,
  name: string,
  order: number,
): {
  header: ProfileWithDetails["qualityItems"][number] | null
  children: Array<ProfileWithDetails["qualityItems"][number]>
  order: number
} {
  const existing = groups.get(name)
  if (existing) return existing
  const group = { header: null, children: [], order }
  groups.set(name, group)
  return group
}

function qualityItemResource(
  item: ProfileWithDetails["qualityItems"][number],
): CompatibleQualityProfileItemResource {
  const name = item.qualityName ?? item.groupName ?? "Unknown"
  return {
    id: item.id,
    name,
    quality: item.qualityName === null ? null : { id: item.id, name: item.qualityName },
    items: [],
    allowed: item.allowed,
    minSize: null,
    maxSize: null,
    preferredSize: null,
  }
}

function qualityItemsFromCompatibleItems(
  items: ReadonlyArray<unknown>,
): ReadonlyArray<QualityItemInput> {
  const rows: Array<QualityItemInput> = []
  let weight = 1

  const visit = (item: unknown, groupName: string | null): void => {
    if (!isObject(item)) return
    const resource = item as CompatibleQualityProfileItemBody
    const children = Array.isArray(resource.items) ? resource.items : []
    const name =
      typeof resource.name === "string" && resource.name.length > 0 ? resource.name : null
    const allowed = typeof resource.allowed === "boolean" ? resource.allowed : true

    if (children.length > 0) {
      const currentGroup = name ?? "Group"
      rows.push({ qualityName: null, groupName: currentGroup, weight, allowed })
      weight += 1
      for (const child of children) {
        visit(child, currentGroup)
      }
      return
    }

    rows.push({
      qualityName: qualityNameFromBody(resource.quality) ?? name,
      groupName,
      weight,
      allowed,
    })
    weight += 1
  }

  for (const item of items) {
    visit(item, null)
  }

  return rows
}

function formatScoresFromCompatibleItems(
  items: ReadonlyArray<unknown>,
): ReadonlyArray<FormatScoreInput> | QualityProfileBodyError {
  const scores: Array<FormatScoreInput> = []

  for (const item of items) {
    if (!isObject(item)) return { error: "formatItems entries must be objects" }
    const resource = item as CompatibleProfileFormatItemBody
    const customFormatId = numberValue(resource.format)
    const score = numberValue(resource.score)
    if (customFormatId === null || customFormatId < 1) {
      return { error: "formatItems entries require a positive format id" }
    }
    if (score === null) return { error: "formatItems entries require a numeric score" }
    scores.push({ customFormatId, score })
  }

  return scores
}

function qualityNameFromBody(quality: unknown): string | null {
  if (!isObject(quality)) return null
  const name = (quality as { readonly name?: unknown }).name
  return typeof name === "string" && name.length > 0 ? name : null
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
