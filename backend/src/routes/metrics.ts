import { Router } from 'express'
import { snmpGet, snmpWalk, OIDs } from '../lib/snmp.js'
import { getTitanSystemMetrics } from '../lib/titan.js'
import { describeError } from '../lib/http.js'
import {
  POLL_INTERVAL_MS,
  BUFFER_SIZE,
  clampPercent,
  summarizePoints,
} from '../lib/metricMath.js'
import type { MetricPoint, Host } from '../types/types.js'
import type { HostSnapshot, VaultHealth } from '../lib/hostHealth.js'
import { loadHistory, saveHistory } from '../lib/historyStore.js'

const router = Router()

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

// ── Host status (read by routes/status.ts) ────────────────

function emptySnapshot(): HostSnapshot {
  return { online: false, error: null, lastPolled: null, model: null, uptimeSec: null, loadAvg: null }
}

const snapshots: Record<Host, HostSnapshot> = {
  synology: emptySnapshot(),
  titan:    emptySnapshot(),
}

let vaultHealth: VaultHealth | null = null

export function getHostSnapshot(host: Host): HostSnapshot {
  return snapshots[host]
}

export function getVaultHealth(): VaultHealth | null {
  return vaultHealth
}

// Last `count` raw readings, oldest first
export function getRecentReadings(host: Host, type: 'cpu' | 'memory', count: number): number[] {
  return getMetricHistory(host, type).slice(-count).map(p => p.value)
}

export function getCurrentDiskUsage(host: Host): { volume: string; pct: number }[] {
  return Object.entries(diskHistory[host])
    .filter(([, points]) => points.length > 0)
    .map(([volume, points]) => ({ volume, pct: points[points.length - 1]!.value }))
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

// Poll Vault's uptime, load and Synology hardware health via SNMP
async function pollSynologyHealth() {
  const vals = await snmpGet([
    OIDs.hostUptime,
    OIDs.load1,
    OIDs.load5,
    OIDs.load15,
    OIDs.modelName,
    OIDs.systemStatus,
    OIDs.temperature,
    OIDs.powerStatus,
    OIDs.systemFanStatus,
    OIDs.cpuFanStatus,
  ])
  const num = (oid: string) => Number(vals[oid] ?? 0)

  snapshots.synology.uptimeSec = Math.floor(num(OIDs.hostUptime) / 100)
  snapshots.synology.loadAvg   = [num(OIDs.load1), num(OIDs.load5), num(OIDs.load15)]
  snapshots.synology.model     = String(vals[OIDs.modelName] ?? '') || null

  const [diskNames, diskStatus, diskHealth, diskTemp, raidNames, raidStatus] = await Promise.all([
    snmpWalk(OIDs.diskName),
    snmpWalk(OIDs.diskStatus),
    snmpWalk(OIDs.diskHealth),
    snmpWalk(OIDs.diskTemperature),
    snmpWalk(OIDs.raidName),
    snmpWalk(OIDs.raidStatus),
  ])

  const byIndex = (rows: { oid: string; value: number | string }[]) =>
    new Map(rows.map(r => [oidIndex(r.oid), r.value]))

  const diskStatusMap = byIndex(diskStatus)
  const diskHealthMap = byIndex(diskHealth)
  const diskTempMap   = byIndex(diskTemp)
  const raidStatusMap = byIndex(raidStatus)

  vaultHealth = {
    systemStatus: num(OIDs.systemStatus),
    temperature:  num(OIDs.temperature),
    powerStatus:  num(OIDs.powerStatus),
    systemFan:    num(OIDs.systemFanStatus),
    cpuFan:       num(OIDs.cpuFanStatus),
    disks: diskNames.map(row => {
      const index = oidIndex(row.oid)
      return {
        name:        String(row.value),
        status:      Number(diskStatusMap.get(index) ?? 0),
        health:      Number(diskHealthMap.get(index) ?? 0),
        temperature: Number(diskTempMap.get(index) ?? 0),
      }
    }),
    raids: raidNames.map(row => ({
      name:   String(row.value),
      status: Number(raidStatusMap.get(oidIndex(row.oid)) ?? 0),
    })),
  }
}

// Poll titan via the titan helper agent
async function pollTitanMetrics() {
  const metrics = await getTitanSystemMetrics()

  snapshots.titan.uptimeSec = metrics.uptimeSec ?? null
  snapshots.titan.loadAvg   = metrics.loadAvg ?? null

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

function recordPoll(host: Host, result: PromiseSettledResult<void>) {
  const snapshot = snapshots[host]
  snapshot.online = result.status === 'fulfilled'

  if (result.status === 'fulfilled') {
    snapshot.error = null
    snapshot.lastPolled = new Date().toISOString()
  } else {
    snapshot.error = describeError(result.reason)
  }
}

async function pollMetrics() {
  const [synology, synologyHealth, titan] = await Promise.allSettled([
    pollSynologyMetrics(),
    pollSynologyHealth(),
    pollTitanMetrics(),
  ])

  recordPoll('synology', synology)
  recordPoll('titan', titan)

  if (synology.status === 'rejected') {
    console.error('Synology SNMP poll error:', synology.reason)
  }
  if (synologyHealth.status === 'rejected') {
    console.error('Synology health poll error:', synologyHealth.reason)
  }
  if (titan.status === 'rejected') {
    console.error('Titan metrics poll error:', titan.reason)
  }
}

// ── Saved history ─────────────────────────────────────────
// With HISTORY_FILE set (the Docker image sets it to a mounted volume), the
// charts survive a redeploy or reboot. Unset, history is memory-only.
const HISTORY_FILE = process.env.HISTORY_FILE ?? ''
const SAVE_INTERVAL_MS = 5 * 60 * 1000
const METRIC_TYPES = ['cpu', 'memory', 'network']

async function restoreHistory() {
  if (!HISTORY_FILE) return
  const saved = await loadHistory(HISTORY_FILE)
  if (!saved) return

  let points = 0
  for (const host of Object.keys(history) as Host[]) {
    for (const type of METRIC_TYPES) {
      const series = saved.history[host][type]
      if (series) { history[host][type] = series; points += series.length }
    }
    for (const [volume, series] of Object.entries(saved.diskHistory[host])) {
      diskHistory[host][volume] = series
      points += series.length
    }
  }
  console.log(`Restored ${points} metric readings from ${HISTORY_FILE}`)
}

// Saves run one at a time, so the timer and a shutdown never write at once
let saving: Promise<void> = Promise.resolve()

export function saveMetricHistory(): Promise<void> {
  if (!HISTORY_FILE) return Promise.resolve()
  saving = saving
    .then(() => saveHistory(HISTORY_FILE, { history, diskHistory }))
    .catch(err => console.error(`Could not save metric history to ${HISTORY_FILE}: ${err?.message ?? err}`))
  return saving
}

// Restore first, so the first poll adds to the saved history instead of
// being overwritten by it. Then poll immediately and every 30s.
restoreHistory().finally(() => {
  pollMetrics()
  setInterval(pollMetrics, POLL_INTERVAL_MS)
  if (HISTORY_FILE) setInterval(saveMetricHistory, SAVE_INTERVAL_MS)
})

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
