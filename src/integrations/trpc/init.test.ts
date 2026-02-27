import { TRPCError } from '@trpc/server'
import { describe, expect, it } from 'vitest'
import { NotFoundError, ValidationError, ConflictError, AuthError } from '#/effect/errors'
import { domainToTRPC } from './init'

describe('domainToTRPC', () => {
  it('maps NotFoundError to NOT_FOUND', () => {
    const err = domainToTRPC(new NotFoundError({ entity: 'movie', id: 42 }))
    expect(err).toBeInstanceOf(TRPCError)
    expect(err.code).toBe('NOT_FOUND')
  })

  it('maps ValidationError to BAD_REQUEST', () => {
    const err = domainToTRPC(new ValidationError({ message: 'bad input' }))
    expect(err).toBeInstanceOf(TRPCError)
    expect(err.code).toBe('BAD_REQUEST')
  })

  it('maps ConflictError to CONFLICT', () => {
    const err = domainToTRPC(new ConflictError({ entity: 'movie', field: 'tmdbId', value: 123 }))
    expect(err).toBeInstanceOf(TRPCError)
    expect(err.code).toBe('CONFLICT')
  })

  it('maps AuthError to UNAUTHORIZED', () => {
    const err = domainToTRPC(new AuthError({ reason: 'expired' }))
    expect(err).toBeInstanceOf(TRPCError)
    expect(err.code).toBe('UNAUTHORIZED')
  })
})
