import { Data } from 'effect'

export class NotFoundError extends Data.TaggedError('NotFoundError')<{
  readonly entity: string
  readonly id: string | number
}> {}

export class ValidationError extends Data.TaggedError('ValidationError')<{
  readonly message: string
}> {}

export class ConflictError extends Data.TaggedError('ConflictError')<{
  readonly entity: string
  readonly field: string
  readonly value: string | number
}> {}

export type AuthErrorReason =
  | 'invalid_credentials'
  | 'expired'
  | 'revoked'
  | 'missing'

export class AuthError extends Data.TaggedError('AuthError')<{
  readonly reason: AuthErrorReason
}> {}
