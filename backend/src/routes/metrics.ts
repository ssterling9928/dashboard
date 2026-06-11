import { Router } from 'express'
import { snmpGet, snmpWalk, OIDs } from '../lib/snmp.js'
import type { MetricSummary, MetricPoint } from '../types/types.js'

const router = Router()

// In-memory ring buffer — stores last 288 readings (24hrs at 5min intervals)
const BUFFER_SIZE = 288
const history: Record<string, MetricPoint[]> = {
  cpu:     [],
  memory:  [],
  network: [],
  disk:    [],
}

// Seed timestamps for history points
function timeLabel(offsetMinutes: number): string {
  const d = new Date(Date.now() - offsetMinutes * 60 * 1000)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function pushReading(type: string, value: number) {
  const buf = history[type]
  if (!buf) return
  buf.push({ time: timeLabel(0), value: Math.round(value) })
  if (buf.length > BUFFER_SIZE) buf.shift()
}

// Filter history by range (hours)
function getRange(type: string, hours: number): MetricPoint[] {
  if (!history[type]) return []
  const points = Math.min(hours * 12, history[type].length) 
  return history[type].slice(-points)
}

function summarize(type: string, hours: number): MetricSummary {
  const pts = getRange(type, hours)
  const values = pts.map(p => p.value)
  const current = values[values.length - 1] ?? 0
  const average = values.length
    ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
    : 0
  const peak = values.length ? Math.max(...values) : 0
  return { current, average, peak, unit: '%', history: pts }
}

// Poll NAS every 5 minutes
async function pollMetrics() {
  try {
    const vals = await snmpGet([
      OIDs.cpuUser,
      OIDs.cpuSystem,
      OIDs.cpuIdle,
      OIDs.memTotal,
      OIDs.memAvailable,
    ])

    const cpuUsed = 100 - Number(vals[OIDs.cpuIdle])
    pushReading('cpu', cpuUsed)

    const memTotal = Number(vals[OIDs.memTotal])
    const memAvail = Number(vals[OIDs.memAvailable])
    const memUsed  = memTotal > 0 ? ((memTotal - memAvail) / memTotal) * 100 : 0
    pushReading('memory', memUsed)

    // Disk — walk volume usage
    const volUsed  = await snmpWalk(OIDs.volumeUsed)
    const volTotal = await snmpWalk(OIDs.volumeTotal)
    if (volTotal[0] && volUsed[0]) {
      const diskPct = (Number(volUsed[0].value) / Number(volTotal[0].value)) * 100
      pushReading('disk', diskPct)
    }

  } catch (err) {
    console.error('SNMP poll error:', err)
  }
}

// Start polling immediately then every 5 mins
pollMetrics()
setInterval(pollMetrics, 5 * 60 * 1000)

// ── GET /api/metrics?type=cpu&range=24 ────────────────────
router.get('/', async (req, res, next) => {
  try {
    const type  = (req.query.type  as string) ?? 'cpu'
    const range = parseInt((req.query.range as string) ?? '24', 10)

    if (!history[type]) {
      return res.status(400).json({ error: `Unknown metric type: ${type}` })
    }

    const summary = summarize(type, range)
    res.json(summary)
  } catch (err) {
    next(err)
  }
})

export default router