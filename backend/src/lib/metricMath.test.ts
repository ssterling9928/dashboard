import { describe, expect, it } from 'vitest'
import {
  BUFFER_SIZE,
  MAX_CHART_POINTS,
  POLL_INTERVAL_MS,
  clampPercent,
  downsample,
  getRange,
  summarizePoints,
} from './metricMath.js'
import type { MetricPoint } from '../types/types.js'

const NOW = Date.UTC(2026, 9, 22, 12, 0, 0)
const HOUR = 60 * 60 * 1000

// One reading every `stepMs`, oldest first, ending at NOW
function series(count: number, stepMs: number, value: (i: number) => number = () => 50): MetricPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    time: new Date(NOW - (count - 1 - i) * stepMs).toISOString(),
    value: value(i),
  }))
}

describe('buffer sizing', () => {
  it('holds exactly 24 hours of readings at the poll interval', () => {
    expect(BUFFER_SIZE).toBe(2880)
    expect(BUFFER_SIZE * POLL_INTERVAL_MS).toBe(24 * HOUR)
  })
})

describe('clampPercent', () => {
  it('clamps to 0–100 and treats non-numbers as 0', () => {
    expect(clampPercent(42)).toBe(42)
    expect(clampPercent(-5)).toBe(0)
    expect(clampPercent(150)).toBe(100)
    expect(clampPercent(NaN)).toBe(0)
    expect(clampPercent(Infinity)).toBe(0)
  })
})

describe('getRange', () => {
  const points = series(31, HOUR)   // 30 hours of hourly points

  it('selects points by timestamp, not by count', () => {
    expect(getRange(points, 1, NOW)).toHaveLength(2)    // NOW-1h and NOW
    expect(getRange(points, 6, NOW)).toHaveLength(7)
  })

  it('clamps the range to 1–24 hours', () => {
    expect(getRange(points, 0, NOW)).toHaveLength(2)    // treated as 1h
    expect(getRange(points, 100, NOW)).toHaveLength(25) // treated as 24h
  })

  it('returns nothing when all points are older than the range', () => {
    expect(getRange(series(5, HOUR).map(p => ({ ...p, time: '2020-01-01T00:00:00Z' })), 24, NOW)).toEqual([])
  })
})

describe('downsample', () => {
  it('leaves short series untouched', () => {
    const points = series(MAX_CHART_POINTS, POLL_INTERVAL_MS)
    expect(downsample(points, Math.round)).toBe(points)
  })

  it('reduces a full day to at most MAX_CHART_POINTS', () => {
    const result = downsample(series(2880, POLL_INTERVAL_MS), Math.round)
    expect(result).toHaveLength(288)
  })

  it('keeps each bucket\'s highest reading and newest timestamp', () => {
    // 2880 points → buckets of 10; first bucket is values 9..0, highest first
    const points = series(2880, POLL_INTERVAL_MS, i => 9 - (i % 10))
    const [first] = downsample(points, n => n)
    expect(first!.value).toBe(9)
    expect(first!.time).toBe(points[9]!.time)
  })
})

describe('summarizePoints', () => {
  it('returns zeros for an empty series', () => {
    expect(summarizePoints([], 24, '%', NOW)).toEqual({
      current: 0, average: 0, peak: 0, unit: '%', history: [],
    })
  })

  it('reports current, average and peak over the range', () => {
    const points = series(3, HOUR / 4, i => [10, 20, 60][i]!)
    const summary = summarizePoints(points, 1, '%', NOW)
    expect(summary).toMatchObject({ current: 60, average: 30, peak: 60, unit: '%' })
  })

  it('keeps a short spike at full height in the downsampled chart', () => {
    // One 100% reading in a full day of 10% — averaging would have hidden it
    const points = series(2880, POLL_INTERVAL_MS, i => (i === 1000 ? 100 : 10))
    const summary = summarizePoints(points, 24, '%', NOW)
    expect(summary.peak).toBe(100)
    expect(Math.max(...summary.history.map(p => p.value))).toBe(100)
    expect(summary.average).toBe(10)
  })

  it('rounds percentages to whole numbers and other units to 2 decimals', () => {
    const points = series(3, HOUR / 4, i => [1.234, 1.235, 1.236][i]!)
    expect(summarizePoints(points, 1, '%', NOW).average).toBe(1)
    expect(summarizePoints(points, 1, 'MB/s', NOW).average).toBe(1.24)
  })
})
