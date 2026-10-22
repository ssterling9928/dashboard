import { describe, expect, it } from 'vitest'
import type { LogEntry } from '@shared/types'
import { collapseRepeats } from './logs'

let nextId = 0
function log(message: string, overrides: Partial<LogEntry> = {}): LogEntry {
  nextId += 1
  return {
    id: `log_${nextId}`,
    timestamp: `2026-10-22 15:03:${String(nextId).padStart(2, '0')}`,
    level: 'info',
    source: 'vault / Connection',
    message,
    ...overrides,
  }
}

describe('collapseRepeats', () => {
  it('returns nothing for no logs', () => {
    expect(collapseRepeats([])).toEqual([])
  })

  it('collapses a run of identical lines into one group, keeping the newest entry', () => {
    const burst = Array.from({ length: 30 }, () => log('User [Stephen] logged in via [SSH].'))
    const groups = collapseRepeats(burst)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.count).toBe(30)
    expect(groups[0]!.log).toBe(burst[0])   // logs arrive newest first
  })

  it('only merges consecutive lines', () => {
    const groups = collapseRepeats([log('A'), log('A'), log('B'), log('A')])
    expect(groups.map(g => [g.log.message, g.count])).toEqual([['A', 2], ['B', 1], ['A', 1]])
  })

  it('keeps lines apart when the level or source differs', () => {
    const groups = collapseRepeats([
      log('restarting'),
      log('restarting', { level: 'warning' }),
      log('restarting', { source: 'grafana' }),
    ])
    expect(groups.map(g => g.count)).toEqual([1, 1, 1])
  })
})
