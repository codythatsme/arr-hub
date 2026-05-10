import type { SpecField } from "#/effect/domain/quality"

export interface CustomFormatLike {
  readonly format: {
    readonly id: number
    readonly name: string
    readonly includeWhenRenaming: boolean
  }
  readonly specs: ReadonlyArray<CustomFormatSpecLike>
}

export interface CustomFormatSpecLike {
  readonly id: number
  readonly name: string
  readonly field: SpecField
  readonly pattern: string
  readonly negate: boolean
  readonly required: boolean
}

export interface CompatibleCustomFormatResource {
  readonly id: number
  readonly name: string
  readonly includeCustomFormatWhenRenaming: boolean
  readonly specifications: ReadonlyArray<CompatibleCustomFormatSpecificationResource>
}

export interface CompatibleCustomFormatSpecificationResource {
  readonly id: number
  readonly name: string
  readonly implementation: string
  readonly implementationName: string
  readonly infoLink: string
  readonly negate: boolean
  readonly required: boolean
  readonly fields: ReadonlyArray<CompatibleFieldResource>
  readonly presets: ReadonlyArray<CompatibleCustomFormatSpecificationResource> | null
}

export interface CompatibleFieldResource {
  readonly order: number
  readonly name: string
  readonly label: string
  readonly unit: string | null
  readonly helpText: string | null
  readonly helpTextWarning: string | null
  readonly helpLink: string | null
  readonly value: string
  readonly type: string
  readonly advanced: boolean
  readonly selectOptions: null
  readonly selectOptionsProviderAction: string | null
  readonly section: string | null
  readonly hidden: string | null
  readonly privacy: "normal"
  readonly placeholder: string | null
  readonly isFloat: boolean
}

export interface CustomFormatBodyError {
  readonly error: string
}

export interface CustomFormatSpecInput {
  readonly name: string
  readonly field: SpecField
  readonly pattern: string
  readonly negate: boolean
  readonly required: boolean
}

export interface CustomFormatInput {
  readonly name: string
  readonly includeWhenRenaming: boolean
  readonly specs: ReadonlyArray<CustomFormatSpecInput>
}

export interface CustomFormatUpdate {
  readonly name?: string
  readonly includeWhenRenaming?: boolean
  readonly specs?: ReadonlyArray<CustomFormatSpecInput>
}

interface CompatibleCustomFormatBody {
  readonly name?: unknown
  readonly includeWhenRenaming?: unknown
  readonly includeCustomFormatWhenRenaming?: unknown
  readonly specs?: unknown
  readonly specifications?: unknown
}

interface CompatibleCustomFormatSpecBody {
  readonly name?: unknown
  readonly field?: unknown
  readonly pattern?: unknown
  readonly implementation?: unknown
  readonly negate?: unknown
  readonly required?: unknown
  readonly fields?: unknown
}

interface CompatibleFieldBody {
  readonly name?: unknown
  readonly value?: unknown
}

const INFO_LINK = "https://wiki.servarr.com/settings#custom-formats"

const SPEC_FIELDS = new Set<SpecField>([
  "releaseTitle",
  "releaseGroup",
  "edition",
  "source",
  "resolution",
  "qualityModifier",
])

const FIELD_METADATA = {
  releaseTitle: {
    implementation: "ReleaseTitleSpecification",
    implementationName: "Release Title",
    label: "Regular Expression",
  },
  releaseGroup: {
    implementation: "ReleaseGroupSpecification",
    implementationName: "Release Group",
    label: "Regular Expression",
  },
  edition: {
    implementation: "EditionSpecification",
    implementationName: "Edition",
    label: "Regular Expression",
  },
  source: {
    implementation: "SourceSpecification",
    implementationName: "Source",
    label: "Source",
  },
  resolution: {
    implementation: "ResolutionSpecification",
    implementationName: "Resolution",
    label: "Resolution",
  },
  qualityModifier: {
    implementation: "QualityModifierSpecification",
    implementationName: "Quality Modifier",
    label: "Quality Modifier",
  },
} as const satisfies Record<
  SpecField,
  {
    readonly implementation: string
    readonly implementationName: string
    readonly label: string
  }
>

const FIELD_BY_IMPLEMENTATION = new Map<string, SpecField>(
  Object.entries(FIELD_METADATA).map(([field, metadata]) => [
    metadata.implementation,
    field as SpecField,
  ]),
)

const RADARR_SOURCE_VALUES = new Map<number, string>([
  [0, "unknown"],
  [1, "cam"],
  [2, "telesync"],
  [3, "telecine"],
  [4, "workprint"],
  [5, "dvd"],
  [6, "tv"],
  [7, "webdl"],
  [8, "webrip"],
  [9, "bluray"],
])

const QUALITY_MODIFIER_VALUES = new Map<number, string>([
  [0, "none"],
  [1, "regional"],
  [2, "screener"],
  [3, "rawhd"],
  [4, "brdisk"],
  [5, "remux"],
])

export function customFormatResource(details: CustomFormatLike): CompatibleCustomFormatResource {
  return {
    id: details.format.id,
    name: details.format.name,
    includeCustomFormatWhenRenaming: details.format.includeWhenRenaming,
    specifications: details.specs
      .toSorted((a, b) => a.id - b.id)
      .map((spec) => customFormatSpecificationResource(spec)),
  }
}

export function customFormatInputFromCompatibleResource(
  body: unknown,
): CustomFormatInput | CustomFormatBodyError {
  const update = customFormatUpdateFromCompatibleResource(body)
  if ("error" in update) return update
  if (update.name === undefined) return { error: "name is required" }
  if (update.specs === undefined || update.specs.length === 0) {
    return { error: "specifications must contain at least one condition" }
  }
  return {
    name: update.name,
    includeWhenRenaming: update.includeWhenRenaming ?? false,
    specs: update.specs,
  }
}

export function customFormatUpdateFromCompatibleResource(
  body: unknown,
): CustomFormatUpdate | CustomFormatBodyError {
  if (!isObject(body)) return { error: "custom format body is required" }
  const resource = body as CompatibleCustomFormatBody
  const update: MutableCustomFormatUpdate = {}

  if (resource.name !== undefined) {
    if (typeof resource.name !== "string" || resource.name.trim().length === 0) {
      return { error: "name must be a non-empty string" }
    }
    update.name = resource.name
  }

  const includeWhenRenaming =
    resource.includeCustomFormatWhenRenaming ?? resource.includeWhenRenaming
  if (includeWhenRenaming !== undefined) {
    if (typeof includeWhenRenaming !== "boolean") {
      return { error: "includeCustomFormatWhenRenaming must be a boolean" }
    }
    update.includeWhenRenaming = includeWhenRenaming
  }

  const specs = resource.specifications ?? resource.specs
  if (specs !== undefined) {
    if (!Array.isArray(specs)) return { error: "specifications must be an array" }
    if (specs.length === 0) {
      return { error: "specifications must contain at least one condition" }
    }

    const parsedSpecs: Array<CustomFormatSpecInput> = []
    for (const spec of specs) {
      const parsed = customFormatSpecInputFromCompatibleResource(spec)
      if ("error" in parsed) return parsed
      parsedSpecs.push(parsed)
    }
    update.specs = parsedSpecs
  }

  return update
}

function customFormatSpecificationResource(
  spec: CustomFormatSpecLike,
): CompatibleCustomFormatSpecificationResource {
  const metadata = FIELD_METADATA[spec.field]
  return {
    id: spec.id,
    name: spec.name,
    implementation: metadata.implementation,
    implementationName: metadata.implementationName,
    infoLink: INFO_LINK,
    negate: spec.negate,
    required: spec.required,
    fields: [
      {
        order: 0,
        name: "value",
        label: metadata.label,
        unit: null,
        helpText: null,
        helpTextWarning: null,
        helpLink: null,
        value: spec.pattern,
        type: "textbox",
        advanced: false,
        selectOptions: null,
        selectOptionsProviderAction: null,
        section: null,
        hidden: null,
        privacy: "normal",
        placeholder: null,
        isFloat: false,
      },
    ],
    presets: null,
  }
}

function customFormatSpecInputFromCompatibleResource(
  value: unknown,
): CustomFormatSpecInput | CustomFormatBodyError {
  if (!isObject(value)) return { error: "specification body is required" }
  const spec = value as CompatibleCustomFormatSpecBody

  if (typeof spec.name !== "string" || spec.name.trim().length === 0) {
    return { error: "specification name must be a non-empty string" }
  }

  const field = specFieldFromBody(spec)
  if (field === null) return { error: "specification implementation is unsupported" }

  const pattern = patternFromBody(field, spec)
  if (pattern === null || pattern.trim().length === 0) {
    return { error: "specification value must be a non-empty string" }
  }

  if (spec.negate !== undefined && typeof spec.negate !== "boolean") {
    return { error: "specification negate must be a boolean" }
  }
  if (spec.required !== undefined && typeof spec.required !== "boolean") {
    return { error: "specification required must be a boolean" }
  }

  return {
    name: spec.name,
    field,
    pattern,
    negate: spec.negate ?? false,
    required: spec.required ?? false,
  }
}

function specFieldFromBody(spec: CompatibleCustomFormatSpecBody): SpecField | null {
  if (typeof spec.field === "string" && SPEC_FIELDS.has(spec.field as SpecField)) {
    return spec.field as SpecField
  }
  if (typeof spec.implementation !== "string") return null
  return FIELD_BY_IMPLEMENTATION.get(spec.implementation) ?? null
}

function patternFromBody(field: SpecField, spec: CompatibleCustomFormatSpecBody): string | null {
  const value =
    spec.pattern ?? fieldValue(spec.fields, "value") ?? fieldValue(spec.fields, "pattern")
  if (value === undefined || value === null) return null
  if (field === "source" && typeof value === "number") {
    return RADARR_SOURCE_VALUES.get(value) ?? String(value)
  }
  if (field === "qualityModifier" && typeof value === "number") {
    return QUALITY_MODIFIER_VALUES.get(value) ?? String(value)
  }
  return String(value)
}

function fieldValue(fields: unknown, name: string): unknown {
  if (!Array.isArray(fields)) return undefined
  const field = fields.find(
    (item): item is CompatibleFieldBody =>
      isObject(item) && (item as CompatibleFieldBody).name === name,
  )
  return field?.value
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

type MutableCustomFormatUpdate = {
  -readonly [K in keyof CustomFormatUpdate]: CustomFormatUpdate[K]
}
