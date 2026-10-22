import { describe, expect, it } from 'vitest'
import snmp from 'net-snmp'
import { normalizeValue } from './snmp.js'

describe('normalizeValue', () => {
  it('decodes Counter64 buffers as big-endian numbers', () => {
    const fourGiB = Buffer.from([0, 0, 0, 1, 0, 0, 0, 0])
    expect(normalizeValue(fourGiB, snmp.ObjectType.Counter64)).toBe(4294967296)
    expect(normalizeValue(Buffer.from([0x01, 0x00]), snmp.ObjectType.Counter64)).toBe(256)
  })

  it('returns other buffers as strings (e.g. Synology model, load average)', () => {
    expect(normalizeValue(Buffer.from('DS423+'), snmp.ObjectType.OctetString)).toBe('DS423+')
    expect(normalizeValue(Buffer.from('0.25'), snmp.ObjectType.OctetString)).toBe('0.25')
  })

  it('passes finite numbers through and stringifies the rest', () => {
    expect(normalizeValue(42)).toBe(42)
    expect(normalizeValue(NaN)).toBe('NaN')
    expect(normalizeValue(10n)).toBe('10')
  })

  it('joins OID arrays and parses numeric strings', () => {
    expect(normalizeValue([1, 3, 6, 1])).toBe('1.3.6.1')
    expect(normalizeValue('17')).toBe(17)
    expect(normalizeValue('eth0')).toBe('eth0')
  })
})
