import { promises as fs } from 'node:fs'
import path from 'node:path'
import { BUFFER_SIZE, MAX_RANGE_HOURS } from './metricMath.js'
import type { Host, MetricPoint } from '../types/types.js'

// Metric history is kept in memory and saved to one JSON file, so a
// redeploy or reboot doesn't empty the charts. About 1–2 MB for 24 hours.

export type HostHistory = Record<Host, Record<string, MetricPoint[]>>

export interface SavedHistory {
  history:     HostHistory
  diskHistory: HostHistory
}

const VERSION = 1
const HOSTS: Host[] = ['synology', 'titan']

function isPoint(value: unknown): value is MetricPoint {
  const p = value as MetricPoint
  return typeof p?.time === 'string'
    && typeof p.value === 'number'
    && Number.isFinite(p.value)
    && !Number.isNaN(Date.parse(p.time))
}

// Keep only well-formed points from the last 24 hours, oldest first, at
// most one buffer's worth. Anything unexpected is dropped, not trusted.
function cleanSeries(raw: unknown, cutoff: number): MetricPoint[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(isPoint)
    .filter(p => Date.parse(p.time) >= cutoff)
    .map(p => ({ time: p.time, value: p.value }))
    .slice(-BUFFER_SIZE)
}

function cleanHostHistory(raw: unknown, cutoff: number): HostHistory {
  const out: HostHistory = { synology: {}, titan: {} }
  for (const host of HOSTS) {
    const series = (raw as Record<string, unknown> | undefined)?.[host]
    if (!series || typeof series !== 'object') continue
    for (const [name, points] of Object.entries(series)) {
      const cleaned = cleanSeries(points, cutoff)
      if (cleaned.length) out[host][name] = cleaned
    }
  }
  return out
}

export function parseHistory(json: string, now = Date.now()): SavedHistory {
  const data = JSON.parse(json)
  if (data?.version !== VERSION) throw new Error(`unsupported history file version: ${data?.version}`)
  const cutoff = now - MAX_RANGE_HOURS * 60 * 60 * 1000
  return {
    history:     cleanHostHistory(data.history, cutoff),
    diskHistory: cleanHostHistory(data.diskHistory, cutoff),
  }
}

// A missing file is normal (first start); anything else is logged and the
// dashboard starts with empty charts rather than failing to start.
export async function loadHistory(file: string): Promise<SavedHistory | null> {
  try {
    return parseHistory(await fs.readFile(file, 'utf8'))
  } catch (err: any) {
    if (err?.code !== 'ENOENT') console.error(`Could not read metric history from ${file}: ${err?.message ?? err}`)
    return null
  }
}

// Write to a temporary file and rename it over the old one, so a crash
// mid-write leaves the previous save intact instead of half a file.
export async function saveHistory(file: string, saved: SavedHistory): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify({ version: VERSION, savedAt: new Date().toISOString(), ...saved }))
  await fs.rename(tmp, file)
}
