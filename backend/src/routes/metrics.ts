import { Router } from 'express'
import { snmpGet, snmpWalk, OIDs } from '../lib/snmp.js'
import { getTitanSystemMetrics } from '../lib/titan.js'
import type { MetricSummary, MetricPoint, Host } from '../types/types.js'

const router = Router()

// In-memory ring buffer — 24hrs of readings at the 30s poll interval
const POLL_INTERVAL_MS = 30 * 1000
const MAX_RANGE_HOURS  = 24
const BUFFER_SIZE      = (MAX_RANGE_HOURS * 60 * 60 * 1000) / POLL_INTERVAL_MS

// Longer ranges are averaged down to at most this many chart points
const MAX_CHART_POINTS = 288
const DEFAULT_VOLUME: Record<Host, string> = {
  synology: '/volume1',
  titan:    '/',
}

const history: Record<Host, Record<string, MetricPoint[]>> = {
  synology: { cpu: [], memory: [], network: [] },
  titan:    { cpu: [], memory: [], network: [] },
}

const diskHistory: Record<Host, Record<string, MetricPoint[]>> = {
  synology: {},
  titan:    {},
}

interface NetSnapshot {
  inBytes: number
  outBytes: number
  timestamp: number
}

let synologyNetSnapshot: NetSnapshot | null = null
let titanNetSnapshot: NetSnapshot | null = null

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

function getMetricHistory(host: Host, type: string): MetricPoint[] {
  return history[host][type] ?? []
}

function getDiskHistory(host: Host, volume: string): MetricPoint[] {
  if (!diskHistory[host][volume]) {
    diskHistory[host][volume] = []
  }
  return diskHistory[host][volume]
}

function getRange(points: MetricPoint[], hours: number): MetricPoint[] {
  const safeHours = Math.max(1, Math.min(MAX_RANGE_HOURS, hours))
  const cutoff = Date.now() - safeHours * 60 * 60 * 1000
  return points.filter(p => new Date(p.time).getTime() >= cutoff)
}

// Average consecutive points into buckets so the chart stays readable
function downsample(points: MetricPoint[], round: (n: number) => number): MetricPoint[] {
  if (points.length <= MAX_CHART_POINTS) return points

  const bucketSize = Math.ceil(points.length / MAX_CHART_POINTS)
  const result: MetricPoint[] = []

  for (let i = 0; i < points.length; i += bucketSize) {
    const bucket = points.slice(i, i + bucketSize)
    const avg = bucket.reduce((sum, p) => sum + p.value, 0) / bucket.length
    result.push({ time: bucket[bucket.length - 1]!.time, value: round(avg) })
  }

  return result
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

  return { current, average, peak, unit, history: downsample(pts, round) }
}

function oidIndex(oid: string): string {
  return oid.split('.').pop() ?? ''
}

function normalizeVolumeParam(input: unknown, host: Host): string {
  const raw = String(input ?? '').trim()
  if (!raw) return DEFAULT_VOLUME[host]
  return raw.startsWith('/') ? raw : `/${raw}`
}

// Poll the Synology NAS via SNMP
async function pollSynologyMetrics() {
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
  pushReading(getMetricHistory('synology', 'cpu'), cpuUsed)

  // Memory — DSM-style available memory = free + buffer + cached
  const memTotal = Number(vals[OIDs.memTotal] ?? 0)
  const memFree = Number(vals[OIDs.memAvailable] ?? 0)
  const memBuffer = Number(vals[OIDs.memBuffer] ?? 0)
  const memCached = Number(vals[OIDs.memCached] ?? 0)

  const memAvailableDsm = memFree + memBuffer + memCached
  const memUsed = memTotal > 0
    ? ((memTotal - Math.min(memAvailableDsm, memTotal)) / memTotal) * 100
    : 0

  pushReading(getMetricHistory('synology', 'memory'), memUsed)

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
    pushReading(getDiskHistory('synology', volume.name), diskPct)
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

    if (synologyNetSnapshot) {
      const elapsedSec = (now - synologyNetSnapshot.timestamp) / 1000
      const deltaIn    = inBytes - synologyNetSnapshot.inBytes
      const deltaOut   = outBytes - synologyNetSnapshot.outBytes

      if (elapsedSec > 0 && deltaIn >= 0 && deltaOut >= 0) {
        const totalMBs = ((deltaIn + deltaOut) / elapsedSec) / (1024 * 1024)
        pushRawReading(getMetricHistory('synology', 'network'), totalMBs)
      }
    }

    synologyNetSnapshot = { inBytes, outBytes, timestamp: now }
  }
}

// Poll titan via the titan helper agent
async function pollTitanMetrics() {
  const metrics = await getTitanSystemMetrics()

  pushReading(getMetricHistory('titan', 'cpu'), metrics.cpuPct)

  const memUsedPct = metrics.memTotal > 0
    ? (metrics.memUsed / metrics.memTotal) * 100
    : 0
  pushReading(getMetricHistory('titan', 'memory'), memUsedPct)

  for (const disk of metrics.disks) {
    if (disk.total <= 0) continue
    const diskPct = (disk.used / disk.total) * 100
    pushReading(getDiskHistory('titan', disk.mount), diskPct)
  }

  const now = Date.now()
  if (titanNetSnapshot) {
    const elapsedSec = (now - titanNetSnapshot.timestamp) / 1000
    const deltaIn    = metrics.netInBytes - titanNetSnapshot.inBytes
    const deltaOut   = metrics.netOutBytes - titanNetSnapshot.outBytes

    if (elapsedSec > 0 && deltaIn >= 0 && deltaOut >= 0) {
      const totalMBs = ((deltaIn + deltaOut) / elapsedSec) / (1024 * 1024)
      pushRawReading(getMetricHistory('titan', 'network'), totalMBs)
    }
  }

  titanNetSnapshot = { inBytes: metrics.netInBytes, outBytes: metrics.netOutBytes, timestamp: now }
}

async function pollMetrics() {
  const results = await Promise.allSettled([pollSynologyMetrics(), pollTitanMetrics()])

  if (results[0]?.status === 'rejected') {
    console.error('Synology SNMP poll error:', results[0].reason)
  }
  if (results[1]?.status === 'rejected') {
    console.error('Titan metrics poll error:', results[1].reason)
  }
}

// Start polling immediately then every 30s
pollMetrics()
setInterval(pollMetrics, POLL_INTERVAL_MS)

// GET /api/metrics?type=cpu&range=24&host=synology
// GET /api/metrics?type=disk&range=24&volume=volume1&host=titan
router.get('/', async (req, res, next) => {
  try {
    const type = String(req.query.type ?? 'cpu')
    const range = parseInt(String(req.query.range ?? '24'), 10) || 24
    const hostParam = String(req.query.host ?? 'synology')

    if (hostParam !== 'synology' && hostParam !== 'titan') {
      return res.status(400).json({ error: `Unknown host: ${hostParam}` })
    }
    const host = hostParam as Host

    if (type === 'disk') {
      const volume = normalizeVolumeParam(req.query.volume, host)
      const points = getDiskHistory(host, volume)

      return res.json({
        volume,
        ...summarizePoints(points, range),
      })
    }

    if (!history[host][type]) {
      return res.status(400).json({ error: `Unknown metric type: ${type}` })
    }

    const unit = type === 'network' ? 'MB/s' : '%'
    return res.json(summarizePoints(getMetricHistory(host, type), range, unit))
  } catch (err) {
    next(err)
  }
})

export default router
