import { describe, expect, it } from 'vitest'
import {
  formatContainers,
  formatLoad,
  formatTick,
  formatTooltipLabel,
  formatUptime,
} from './format'

// vitest.config.ts pins TZ=America/Chicago; 19:35Z is 2:35 PM CDT
const TIME = '2026-10-21T19:35:00.000Z'

describe('chart time formatting', () => {
  it('always shows hours and minutes on the axis', () => {
    expect(formatTick(TIME, 'en-US')).toBe('2:35 PM')
  })

  it('gives readings within the same hour distinct axis labels', () => {
    // Regression: with hour-only labels, an hour of data on the 24h range read "3 PM" on every tick
    const labels = ['2026-10-21T20:05:00Z', '2026-10-21T20:25:00Z', '2026-10-21T20:45:00Z']
      .map(t => formatTick(t, 'en-US'))
    expect(new Set(labels).size).toBe(3)
    expect(labels).toEqual(['3:05 PM', '3:25 PM', '3:45 PM'])
  })

  it('shows weekday, date and time in the tooltip', () => {
    expect(formatTooltipLabel(TIME, 'en-US')).toBe('Wed, Oct 21, 2:35 PM')
  })
})

describe('formatUptime', () => {
  it('formats minutes, hours and days', () => {
    expect(formatUptime(59)).toBe('0m')
    expect(formatUptime(5 * 60)).toBe('5m')
    expect(formatUptime(2 * 3600 + 3 * 60)).toBe('2h 3m')
    expect(formatUptime(69 * 86400 + 14 * 3600 + 6 * 60)).toBe('69d 14h 6m')
  })

  it('shows a dash when unknown', () => {
    expect(formatUptime(null)).toBe('—')
  })
})

describe('formatLoad and formatContainers', () => {
  it('formats load average to two decimals', () => {
    expect(formatLoad([0.24, 0.3, 1])).toBe('0.24, 0.30, 1.00')
    expect(formatLoad(null)).toBe('—')
  })

  it('formats running / total containers', () => {
    expect(formatContainers({ running: 21, total: 21 })).toBe('21 / 21 running')
    expect(formatContainers(null)).toBe('—')
  })
})
