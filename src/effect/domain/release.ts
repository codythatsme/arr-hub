import type { ReleaseCandidate } from "./indexer"
import type { QualityModifier, QualityName, QualitySource } from "./quality"

// ── Parsed Title ──

export interface ParsedTitle {
  readonly title: string
  readonly year: number | null
  readonly season: number | null
  readonly episode: number | null
  readonly resolution: number | null
  readonly source: QualitySource | null
  readonly modifier: QualityModifier | null
  readonly codec: string | null
  readonly releaseGroup: string | null
  readonly edition: string | null
  readonly proper: boolean
  readonly qualityName: QualityName | null
}

// ── Decision Types ──

export type ReleaseDecision = "accepted" | "rejected" | "upgrade" | "skipped"

export type DecisionStage = "parse" | "filter" | "score" | "upgrade" | "rank"

export interface DecisionReason {
  readonly stage: DecisionStage
  readonly rule: string
  readonly detail: string
}

export interface RankedDecision {
  readonly candidate: ReleaseCandidate
  readonly parsed: ParsedTitle | null
  readonly qualityRank: number | null
  readonly formatScore: number
  readonly decision: ReleaseDecision
  readonly reasons: ReadonlyArray<DecisionReason>
}

// ── Evaluation Context ──

export type MediaType = "movie" | "episode" | "season"

export interface ExistingFile {
  readonly qualityName: QualityName
  readonly qualityRank: number
  readonly formatScore: number
}

export interface EvaluationContext {
  readonly mediaId: number
  readonly mediaType: MediaType
  readonly existingFile?: ExistingFile
}

/** Classify a parsed title: did it look like a season pack (season present, episode absent)? */
export function isSeasonPack(parsed: ParsedTitle): boolean {
  return parsed.season !== null && parsed.episode === null
}
