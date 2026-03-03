import { Data } from "effect"

export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly entity: string
  readonly id: string | number
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string
}> {}

export class ConflictError extends Data.TaggedError("ConflictError")<{
  readonly entity: string
  readonly field: string
  readonly value: string | number
}> {}

export type AuthErrorReason = "invalid_credentials" | "expired" | "revoked" | "missing"

export class AuthError extends Data.TaggedError("AuthError")<{
  readonly reason: AuthErrorReason
}> {}

export class ProfileInUseError extends Data.TaggedError("ProfileInUseError")<{
  readonly profileId: number
  readonly movieCount: number
  readonly seriesCount: number
}> {}

export class BundleNotFoundError extends Data.TaggedError("BundleNotFoundError")<{
  readonly bundleId: string
}> {}

export class BundleVersionConflictError extends Data.TaggedError("BundleVersionConflictError")<{
  readonly bundleId: string
  readonly appliedVersion: number
  readonly requestedVersion: number
}> {}

export type IndexerErrorReason =
  | "connection_failed"
  | "auth_failed"
  | "search_timeout"
  | "invalid_response"
  | "rate_limited"

export class IndexerError extends Data.TaggedError("IndexerError")<{
  readonly indexerId: number
  readonly indexerName: string
  readonly reason: IndexerErrorReason
  readonly message: string
  readonly retryable: boolean
}> {}

export class EncryptionError extends Data.TaggedError("EncryptionError")<{
  readonly message: string
}> {}

export type DownloadClientErrorReason =
  | "auth_failed"
  | "connection_refused"
  | "timeout"
  | "category_create_failed"
  | "download_rejected"
  | "invalid_response"

export class DownloadClientError extends Data.TaggedError("DownloadClientError")<{
  readonly clientId: number
  readonly clientName: string
  readonly reason: DownloadClientErrorReason
  readonly message: string
  readonly retryable: boolean
}> {}

export type MediaServerErrorReason =
  | "auth_failed"
  | "connection_refused"
  | "timeout"
  | "library_not_found"
  | "sync_failed"
  | "invalid_response"

export class MediaServerError extends Data.TaggedError("MediaServerError")<{
  readonly serverId: number
  readonly serverName: string
  readonly reason: MediaServerErrorReason
  readonly message: string
  readonly retryable: boolean
}> {}

export class ParseFailed extends Data.TaggedError("ParseFailed")<{
  readonly title: string
  readonly message: string
}> {}

export type SchedulerErrorReason = "duplicate_job" | "invalid_transition" | "paused"

export class SchedulerError extends Data.TaggedError("SchedulerError")<{
  readonly reason: SchedulerErrorReason
  readonly message: string
}> {}

export type AcquisitionStage = "search" | "evaluate" | "grab"

export class AcquisitionError extends Data.TaggedError("AcquisitionError")<{
  readonly movieId: number
  readonly stage: AcquisitionStage
  readonly message: string
}> {}
