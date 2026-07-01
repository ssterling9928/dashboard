import { Router } from 'express'
import { snmpGet, snmpWalk, OIDs } from '../lib/snmp.js'
import type { MetricSummary, MetricPoint } from '../types/types.js'

const router = Router()

// In-memory ring buffer — stores last 288 readings (24hrs at 5min intervals)
const BUFFER_SIZE = 288
const DEFAULT_VOLUME = '/volume1'

const history: Record<string, MetricPoint[]> = {
  cpu: [],
  memory: [],
  network: [],
}

const diskHistory: Record<string, MetricPoint[]> = {}

interface NetSnapshot {
  inBytes: number
  outBytes: number
  timestamp: number
}

let netSnapshot: NetSnapshot | null = null

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function pushReading(buf: MetricPoint[], value: number) {
  buf.push({
    time: new Date().toISOString(),
    value: Math.round(clampPercent(value)),
  })
  if (buf.length > BUFFER_SIZE) buf.shift()
}

function pushRawReading(buf: MetricPoint[], value: number) {
  buf.push({
    time: new Date().toISOString(),
    value: Number.isFinite(value) ? Math.round(value * 100) / 100 : 0,
  })
  if (buf.length > BUFFER_SIZE) buf.shift()
}

function getMetricHistory(type: string): MetricPoint[] {
  return history[type] ?? []
}

function getDiskHistory(volume: string): MetricPoint[] {
  if (!diskHistory[volume]) {
    diskHistory[volume] = []
  }
  return diskHistory[volume]
}

function getRange(points: MetricPoint[], hours: number): MetricPoint[] {
  const safeHours = Math.max(1, Math.min(24, hours))
  const count = Math.min(safeHours * 12, points.length)
  return points.slice(-count)
}

function summarizePoints(points: MetricPoint[], hours: number, unit = '%'): MetricSummary {
  const pts = getRange(points, hours)
  const values = pts.map(p => p.value)
  const round = unit === '%'
    ? (n: number) => Math.round(n)
    : (n: number) => Math.round(n * 100) / 100

  const current = values[values.length - 1] ?? 0
  const average = values.length
    ? round(values.reduce((a, b) => a + b, 0) / values.length)
    : 0
  const peak = values.length ? round(Math.max(...values)) : 0

  return { current, average, peak, unit, history: pts }
}

function oidIndex(oid: string): string {
  return oid.split('.').pop() ?? ''
}

function normalizeVolumeParam(input: unknown): string {
  const raw = String(input ?? 'volume1').trim()
  if (!raw) return DEFAULT_VOLUME
  return raw.startsWith('/') ? raw : `/${raw}`
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
      OIDs.memBuffer,
      OIDs.memCached,
    ])

    // CPU — ssCpuIdle is idle percentage over the last minute
    const cpuIdle = Number(vals[OIDs.cpuIdle] ?? 0)
    const cpuUsed = 100 - cpuIdle
    pushReading(getMetricHistory('cpu'), cpuUsed)

    // Memory — DSM-style available memory = free + buffer + cached
    const memTotal = Number(vals[OIDs.memTotal] ?? 0)
    const memFree = Number(vals[OIDs.memAvailable] ?? 0)
    const memBuffer = Number(vals[OIDs.memBuffer] ?? 0)
    const memCached = Number(vals[OIDs.memCached] ?? 0)

    const memAvailableDsm = memFree + memBuffer + memCached
    const memUsed = memTotal > 0
      ? ((memTotal - Math.min(memAvailableDsm, memTotal)) / memTotal) * 100
      : 0

    pushReading(getMetricHistory('memory'), memUsed)

    // Disk — poll all /volumeN entries and store each separately
    const [volNames, volTotal, volUsed] = await Promise.all([
      snmpWalk(OIDs.volumeName),
      snmpWalk(OIDs.volumeTotal),
      snmpWalk(OIDs.volumeUsed),
    ])

    const nameMap = new Map(volNames.map(row => [oidIndex(row.oid), String(row.value)]))
    const totalMap = new Map(volTotal.map(row => [oidIndex(row.oid), Number(row.value)]))
    const usedMap = new Map(volUsed.map(row => [oidIndex(row.oid), Number(row.value)]))

    const volumes = [...nameMap.keys()].map(index => ({
      index,
      name: nameMap.get(index) ?? '',
      total: totalMap.get(index) ?? 0,
      used: usedMap.get(index) ?? 0,
    }))

    const mountedVolumes = volumes.filter(v =>
      /^\/volume\d+$/i.test(v.name) && v.total > 0
    )

    for (const volume of mountedVolumes) {
      const diskPct = (volume.used / volume.total) * 100
      pushReading(getDiskHistory(volume.name), diskPct)
    }

    // Network — delta-based MB/s for eth0
    const [ifNames, ifIn, ifOut] = await Promise.all([
      snmpWalk(OIDs.netIfName),
      snmpWalk(OIDs.netInBytes),
      snmpWalk(OIDs.netOutBytes),
    ])

    const ifNameMap = new Map(ifNames.map(r => [oidIndex(r.oid), String(r.value)]))
    const ifInMap   = new Map(ifIn.map(r => [oidIndex(r.oid), Number(r.value)]))
    const ifOutMap  = new Map(ifOut.map(r => [oidIndex(r.oid), Number(r.value)]))

    const eth0Index = [...ifNameMap.entries()].find(([, name]) => name === 'eth0')?.[0]

    if (eth0Index !== undefined) {
      const inBytes  = ifInMap.get(eth0Index) ?? 0
      const outBytes = ifOutMap.get(eth0Index) ?? 0
      const now      = Date.now()

      if (netSnapshot) {
        const elapsedSec = (now - netSnapshot.timestamp) / 1000
        const deltaIn    = inBytes - netSnapshot.inBytes
        const deltaOut   = outBytes - netSnapshot.outBytes

        if (elapsedSec > 0 && deltaIn >= 0 && deltaOut >= 0) {
          const totalMBs = ((deltaIn + deltaOut) / elapsedSec) / (1024 * 1024)
          pushRawReading(getMetricHistory('network'), totalMBs)
        }
      }

      netSnapshot = { inBytes, outBytes, timestamp: now }
    }
  } catch (err) {
    console.error('SNMP poll error:', err)
  }
}

// Start polling immediately then every 5 mins
pollMetrics()
setInterval(pollMetrics, 30 * 1000)

// GET /api/metrics?type=cpu&range=24
// GET /api/metrics?type=disk&range=24&volume=volume1
router.get('/', async (req, res, next) => {
  try {
    const type = String(req.query.type ?? 'cpu')
    const range = parseInt(String(req.query.range ?? '24'), 10) || 24

    if (type === 'disk') {
      const volume = normalizeVolumeParam(req.query.volume)
      const points = getDiskHistory(volume)

      return res.json({
        volume,
        ...summarizePoints(points, range),
      })
    }

    if (!history[type]) {
      return res.status(400).json({ error: `Unknown metric type: ${type}` })
    }

    const unit = type === 'network' ? 'MB/s' : '%'
    return res.json(summarizePoints(getMetricHistory(type), range, unit))
  } catch (err) {
    next(err)
  }
})

export default router