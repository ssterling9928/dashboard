import { describe, expect, it } from 'vitest'
import { describeError, fetchFailureReason } from './http.js'

describe('describeError', () => {
  it('prefers the network error code from fetch\'s cause', () => {
    expect(describeError(new Error('fetch failed', { cause: { code: 'ECONNREFUSED' } }))).toBe('ECONNREFUSED')
  })

  it('falls back to the cause message, then the error message', () => {
    expect(describeError(new Error('fetch failed', { cause: { message: 'bad port' } }))).toBe('bad port')
    expect(describeError(new Error('Synology login failed'))).toBe('Synology login failed')
  })

  it('stringifies non-Error values', () => {
    expect(describeError('timeout')).toBe('timeout')
    expect(describeError(404)).toBe('404')
  })
})

describe('fetchFailureReason', () => {
  it('reports a timeout in seconds', () => {
    const err = new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    expect(fetchFailureReason(err, 10000)).toBe('timed out after 10s')
  })

  it('otherwise gives the network error code', () => {
    expect(fetchFailureReason(new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }), 10000)).toBe('ECONNREFUSED')
  })

  it('passes the certificate pin message through', () => {
    const cause = new Error('Certificate fingerprint mismatch for 10.0.0.30: got AA:BB')
    expect(fetchFailureReason(new TypeError('fetch failed', { cause }), 10000)).toMatch(/fingerprint mismatch/)
  })
})
