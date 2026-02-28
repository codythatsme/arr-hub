import { TRPCError } from '@trpc/server'
import { describe, expect, it } from 'vitest'
import { NotFoundError, ValidationError, ConflictError, AuthError, IndexerError, EncryptionError } from '#/effect/errors'
import { domainToTRPC } from './init'

import { NotFoundError, ValidationError, ConflictError, AuthError } from "#/effect/errors"

import { domainToTRPC } from "./init"

describe("domainToTRPC", () => {
  it("maps NotFoundError to NOT_FOUND", () => {
    const err = domainToTRPC(new NotFoundError({ entity: "movie", id: 42 }))
    expect(err).toBeInstanceOf(TRPCError)
    expect(err.code).toBe("NOT_FOUND")
  })

  it("maps ValidationError to BAD_REQUEST", () => {
    const err = domainToTRPC(new ValidationError({ message: "bad input" }))
    expect(err).toBeInstanceOf(TRPCError)
    expect(err.code).toBe("BAD_REQUEST")
  })

  it("maps ConflictError to CONFLICT", () => {
    const err = domainToTRPC(new ConflictError({ entity: "movie", field: "tmdbId", value: 123 }))
    expect(err).toBeInstanceOf(TRPCError)
    expect(err.code).toBe("CONFLICT")
  })

  it("maps AuthError to UNAUTHORIZED", () => {
    const err = domainToTRPC(new AuthError({ reason: "expired" }))
    expect(err).toBeInstanceOf(TRPCError)
    expect(err.code).toBe("UNAUTHORIZED")
  })

  it('maps IndexerError auth_failed to UNAUTHORIZED', () => {
    const err = domainToTRPC(new IndexerError({
      indexerId: 1, indexerName: 'test', reason: 'auth_failed', message: 'bad key', retryable: false,
    }))
    expect(err).toBeInstanceOf(TRPCError)
    expect(err.code).toBe('UNAUTHORIZED')
  })

  it('maps IndexerError connection_failed to BAD_GATEWAY', () => {
    const err = domainToTRPC(new IndexerError({
      indexerId: 1, indexerName: 'test', reason: 'connection_failed', message: 'refused', retryable: true,
    }))
    expect(err.code).toBe('BAD_GATEWAY')
  })

  it('maps IndexerError search_timeout to TIMEOUT', () => {
    const err = domainToTRPC(new IndexerError({
      indexerId: 1, indexerName: 'test', reason: 'search_timeout', message: 'timed out', retryable: true,
    }))
    expect(err.code).toBe('TIMEOUT')
  })

  it('maps IndexerError rate_limited to TOO_MANY_REQUESTS', () => {
    const err = domainToTRPC(new IndexerError({
      indexerId: 1, indexerName: 'test', reason: 'rate_limited', message: 'slow down', retryable: true,
    }))
    expect(err.code).toBe('TOO_MANY_REQUESTS')
  })

  it('maps EncryptionError to INTERNAL_SERVER_ERROR', () => {
    const err = domainToTRPC(new EncryptionError({ message: 'decrypt failed' }))
    expect(err).toBeInstanceOf(TRPCError)
    expect(err.code).toBe('INTERNAL_SERVER_ERROR')
  })
})
