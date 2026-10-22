import { describe, expect, it } from 'vitest'
import { describeError } from './http.js'

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
