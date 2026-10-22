import { Router } from 'express'
import { getJson, describeError } from '../lib/http.js'
import { listSynologyServices, listTitanServices } from './services.js'
import { SYNO_HELPER_URL } from './packages.js'
import {
  getHostSnapshot,
  getVaultHealth,
  getRecentReadings,
  getCurrentDiskUsage,
} from './metrics.js'
import type { Alert, AlertSeverity, Host, HostStatus, Service, SystemStatus } from '../types/types.js'

const router = Router()

// ── Thresholds ────────────────────────────────────────────

const DISK_WARN_PCT      = 85
const DISK_CRIT_PCT      = 95
const MEMORY_WARN_PCT    = 90
const CPU_WARN_PCT       = 90
const CPU_SUSTAINED_READINGS = 10   // 5 minutes at the 30s poll interval
const SYSTEM_TEMP_WARN_C = 70
const DISK_TEMP_WARN_C   = 60

const HOST_LABELS: Record<Host, string> = {
  synology: 'Vault',
  titan:    'Titan',
}

// Synology MIB status codes
const DISK_STATUS: Record<number, { severity: AlertSeverity; text: string }> = {
  3: { severity: 'warning',  text: 'not initialized' },
  4: { severity: 'critical', text: 'system partition failed' },
  5: { severity: 'critical', text: 'crashed' },
}
const DISK_HEALTH: Record<number, { severity: AlertSeverity; text: string }> = {
  2: { severity: 'warning',  text: 'health warning' },
  3: { severity: 'critical', text: 'health critical' },
  4: { severity: 'critical', text: 'failing' },
}
const RAID_STATUS: Record<number, { severity: AlertSeverity; text: string }> = {
  2:  { severity: 'warning',  text: 'repairing' },
  11: { severity: 'critical', text: 'degraded' },
  12: { severity: 'critical', text: 'crashed' },
}

// ── Alert builders ────────────────────────────────────────

function alert(severity: AlertSeverity, host: Host, key: string, title: string, detail: string): Alert {
  return { id: `${host}:${key}`, severity, host, title, detail }
}

function reachabilityAlerts(
  synologyServices: PromiseSettledResult<Service[]>,
  titanServices: PromiseSettledResult<Service[]>,
  synologyHelper: PromiseSettledResult<unknown>,
): Alert[] {
  const alerts: Alert[] = []
  const vault = getHostSnapshot('synology')
  const titan = getHostSnapshot('titan')

  // A null error means the first poll hasn't finished yet — not an outage
  if (!vault.online && vault.error) {
    alerts.push(alert('critical', 'synology', 'snmp', 'Vault not responding to SNMP', vault.error))
  }
  if (synologyServices.status === 'rejected') {
    alerts.push(alert('critical', 'synology', 'dsm', 'Vault DSM API unreachable', describeError(synologyServices.reason)))
  }
  if (synologyHelper.status === 'rejected') {
    alerts.push(alert('warning', 'synology', 'helper', 'Vault package helper unreachable', describeError(synologyHelper.reason)))
  }
  if ((!titan.online && titan.error) || titanServices.status === 'rejected') {
    const detail = titan.error ?? (titanServices.status === 'rejected' ? describeError(titanServices.reason) : '')
    alerts.push(alert('critical', 'titan', 'helper', 'Titan helper unreachable', detail))
  }

  return alerts
}

function containerAlerts(services: Service[]): Alert[] {
  return services
    .filter(s => s.Status !== 'running')
    .map(s => alert(
      'warning',
      s.Host,
      `container:${s.Name}`,
      `${s.Name} is ${s.Status}`,
      `Container on ${HOST_LABELS[s.Host]}`,
    ))
}

function resourceAlerts(host: Host): Alert[] {
  const alerts: Alert[] = []
  const label = HOST_LABELS[host]

  for (const { volume, pct } of getCurrentDiskUsage(host)) {
    if (pct >= DISK_WARN_PCT) {
      const severity = pct >= DISK_CRIT_PCT ? 'critical' : 'warning'
      alerts.push(alert(severity, host, `disk:${volume}`, `${label} disk ${volume} at ${pct}%`, `Above the ${DISK_WARN_PCT}% threshold`))
    }
  }

  const memory = getRecentReadings(host, 'memory', 1)[0]
  if (memory !== undefined && memory >= MEMORY_WARN_PCT) {
    alerts.push(alert('warning', host, 'memory', `${label} memory at ${memory}%`, `Above the ${MEMORY_WARN_PCT}% threshold`))
  }

  const cpu = getRecentReadings(host, 'cpu', CPU_SUSTAINED_READINGS)
  if (cpu.length === CPU_SUSTAINED_READINGS && cpu.every(v => v >= CPU_WARN_PCT)) {
    alerts.push(alert('warning', host, 'cpu', `${label} CPU sustained above ${CPU_WARN_PCT}%`, 'For the last 5 minutes'))
  }

  return alerts
}

function vaultHardwareAlerts(): Alert[] {
  const health = getVaultHealth()
  if (!health) return []

  const alerts: Alert[] = []

  if (health.systemStatus !== 1) {
    alerts.push(alert('critical', 'synology', 'hw:system', 'Vault system status failed', 'DSM reports a system fault'))
  }
  if (health.powerStatus !== 1) {
    alerts.push(alert('critical', 'synology', 'hw:power', 'Vault power supply fault', 'DSM reports a power status failure'))
  }
  if (health.systemFan !== 1 || health.cpuFan !== 1) {
    const which = [health.systemFan !== 1 && 'system', health.cpuFan !== 1 && 'CPU'].filter(Boolean).join(' and ')
    alerts.push(alert('warning', 'synology', 'hw:fan', `Vault ${which} fan fault`, 'Check the NAS fans'))
  }
  if (health.temperature >= SYSTEM_TEMP_WARN_C) {
    alerts.push(alert('warning', 'synology', 'hw:temp', `Vault running hot (${health.temperature}°C)`, `Above ${SYSTEM_TEMP_WARN_C}°C`))
  }

  for (const disk of health.disks) {
    const status = DISK_STATUS[disk.status]
    if (status) {
      alerts.push(alert(status.severity, 'synology', `hw:disk-status:${disk.name}`, `${disk.name} ${status.text}`, 'Vault drive status'))
    }
    const diskHealth = DISK_HEALTH[disk.health]
    if (diskHealth) {
      alerts.push(alert(diskHealth.severity, 'synology', `hw:disk-health:${disk.name}`, `${disk.name} ${diskHealth.text}`, 'Vault drive health'))
    }
    if (disk.temperature >= DISK_TEMP_WARN_C) {
      alerts.push(alert('warning', 'synology', `hw:disk-temp:${disk.name}`, `${disk.name} running hot (${disk.temperature}°C)`, `Above ${DISK_TEMP_WARN_C}°C`))
    }
  }

  for (const raid of health.raids) {
    const status = RAID_STATUS[raid.status]
    if (status) {
      alerts.push(alert(status.severity, 'synology', `hw:raid:${raid.name}`, `${raid.name} ${status.text}`, 'Vault storage'))
    }
  }

  return alerts
}

// ── Host summaries ────────────────────────────────────────

function hostStatus(host: Host, services: PromiseSettledResult<Service[]>): HostStatus {
  const snapshot = getHostSnapshot(host)
  const list = services.status === 'fulfilled' ? services.value : null

  return {
    host,
    label:      HOST_LABELS[host],
    online:     snapshot.online,
    model:      snapshot.model,
    uptimeSec:  snapshot.uptimeSec,
    loadAvg:    snapshot.loadAvg,
    containers: list
      ? { running: list.filter(s => s.Status === 'running').length, total: list.length }
      : null,
    lastPolled: snapshot.lastPolled,
  }
}

// ── GET /api/status ───────────────────────────────────────
router.get('/', async (_req, res, next) => {
  try {
    const [synologyServices, titanServices, synologyHelper] = await Promise.allSettled([
      listSynologyServices(),
      listTitanServices(),
      getJson(`${SYNO_HELPER_URL}/health`, 5000),
    ])

    const services = [synologyServices, titanServices]
      .flatMap(r => r.status === 'fulfilled' ? r.value : [])

    const alerts = [
      ...reachabilityAlerts(synologyServices, titanServices, synologyHelper),
      ...vaultHardwareAlerts(),
      ...resourceAlerts('synology'),
      ...resourceAlerts('titan'),
      ...containerAlerts(services),
    ].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1))

    const status: SystemStatus = {
      overall: alerts.some(a => a.severity === 'critical')
        ? 'critical'
        : alerts.length > 0 ? 'warning' : 'ok',
      hosts: [
        hostStatus('synology', synologyServices),
        hostStatus('titan', titanServices),
      ],
      alerts,
    }

    res.json(status)
  } catch (err) {
    next(err)
  }
})

export default router
