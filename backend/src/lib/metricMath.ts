import type { MetricPoint, MetricSummary } from '../types/types.js'

// In-memory ring buffer — 24hrs of readings at the 30s poll interval
export const POLL_INTERVAL_MS = 30 * 1000
export const MAX_RANGE_HOURS  = 24
export const BUFFER_SIZE      = (MAX_RANGE_HOURS * 60 * 60 * 1000) / POLL_INTERVAL_MS

// Longer ranges are reduced to at most this many chart points
export const MAX_CHART_POINTS = 288

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

// Points from the last `hours` (clamped to 1–24), by timestamp
export function getRange(points: MetricPoint[], hours: number, now = Date.now()): MetricPoint[] {
  const safeHours = Math.max(1, Math.min(MAX_RANGE_HOURS, hours))
  const cutoff = now - safeHours * 60 * 60 * 1000
  return points.filter(p => new Date(p.time).getTime() >= cutoff)
}

// Group consecutive points into buckets so the chart stays readable. Each
// bucket keeps its highest reading rather than the average, so short spikes
// still reach their real height on the chart
export function downsample(points: MetricPoint[], round: (n: number) => number): MetricPoint[] {
  if (points.length <= MAX_CHART_POINTS) return points

  const bucketSize = Math.ceil(points.length / MAX_CHART_POINTS)
  const result: MetricPoint[] = []

  for (let i = 0; i < points.length; i += bucketSize) {
    const bucket = points.slice(i, i + bucketSize)
    const max = Math.max(...bucket.map(p => p.value))
    result.push({ time: bucket[bucket.length - 1]!.time, value: round(max) })
  }

  return result
}

// Current / average / peak come from every reading in range; only the
// history sent to the chart is downsampled
export function summarizePoints(
  points: MetricPoint[],
  hours: number,
  unit = '%',
  now = Date.now(),
): MetricSummary {
  const pts = getRange(points, hours, now)
  const values = pts.map(p => p.value)
  const round = unit === '%'
    ? (n: number) => Math.round(n)
    : (n: number) => Math.round(n * 100) / 100

  const current = values[values.length - 1] ?? 0
  const average = values.length
    ? round(values.reduce((a, b) => a + b, 0) / values.length)
    : 0
  const peak = values.length ? round(Math.max(...values)) : 0

  return { current, average, peak, unit, history: downsample(pts, round) }
}
