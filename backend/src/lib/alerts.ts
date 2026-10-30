import { describeError } from './http.js'
import type { HostSnapshot, VaultHealth } from './hostHealth.js'
import type { Alert, AlertSeverity, Host, Service, SystemStatus } from '../types/types.js'

// ── Thresholds ────────────────────────────────────────────

export const DISK_WARN_PCT          = 85
export const DISK_CRIT_PCT          = 95
export const MEMORY_WARN_PCT        = 90
export const CPU_WARN_PCT           = 90
export const CPU_SUSTAINED_READINGS = 10   // 5 minutes at the 30s poll interval
export const SYSTEM_TEMP_WARN_C     = 70
export const DISK_TEMP_WARN_C       = 60

export const HOST_LABELS: Record<Host, string> = {
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

export interface ReachabilityInput {
  vault:            HostSnapshot
  titan:            HostSnapshot
  synologyServices: PromiseSettledResult<Service[]>
  titanServices:    PromiseSettledResult<Service[]>
  synologyHelper:   PromiseSettledResult<unknown>
}

export function reachabilityAlerts(input: ReachabilityInput): Alert[] {
  const { vault, titan, synologyServices, titanServices, synologyHelper } = input
  const alerts: Alert[] = []

  // A null error means the first poll hasn't finished yet — not an outage
  if (!vault.online && vault.error) {
    alerts.push(alert('critical', 'synology', 'snmp', 'Vault not responding to SNMP', vault.error))
  }
  // The NAS helper serves both containers and packages: one alert if it's
  // down, a separate one if it's up but listing containers failed
  if (synologyHelper.status === 'rejected') {
    alerts.push(alert('critical', 'synology', 'helper', 'Vault helper unreachable', describeError(synologyHelper.reason)))
  } else if (synologyServices.status === 'rejected') {
    alerts.push(alert('critical', 'synology', 'containers', 'Vault containers unavailable', describeError(synologyServices.reason)))
  }
  if ((!titan.online && titan.error) || titanServices.status === 'rejected') {
    const detail = titan.error ?? (titanServices.status === 'rejected' ? describeError(titanServices.reason) : '')
    alerts.push(alert('critical', 'titan', 'helper', 'Titan helper unreachable', detail))
  }

  return alerts
}

export function containerAlerts(services: Service[]): Alert[] {
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

export interface ResourceReadings {
  disks:     { volume: string; pct: number }[]
  memory:    number | undefined     // latest reading
  cpuRecent: number[]               // newest last
}

export function resourceAlerts(host: Host, readings: ResourceReadings): Alert[] {
  const alerts: Alert[] = []
  const label = HOST_LABELS[host]

  for (const { volume, pct } of readings.disks) {
    if (pct >= DISK_WARN_PCT) {
      const severity = pct >= DISK_CRIT_PCT ? 'critical' : 'warning'
      alerts.push(alert(severity, host, `disk:${volume}`, `${label} disk ${volume} at ${pct}%`, `Above the ${DISK_WARN_PCT}% threshold`))
    }
  }

  const memory = readings.memory
  if (memory !== undefined && memory >= MEMORY_WARN_PCT) {
    alerts.push(alert('warning', host, 'memory', `${label} memory at ${memory}%`, `Above the ${MEMORY_WARN_PCT}% threshold`))
  }

  const cpu = readings.cpuRecent.slice(-CPU_SUSTAINED_READINGS)
  if (cpu.length === CPU_SUSTAINED_READINGS && cpu.every(v => v >= CPU_WARN_PCT)) {
    alerts.push(alert('warning', host, 'cpu', `${label} CPU sustained above ${CPU_WARN_PCT}%`, 'For the last 5 minutes'))
  }

  return alerts
}

export function vaultHardwareAlerts(health: VaultHealth | null): Alert[] {
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

// ── Combining ─────────────────────────────────────────────

// Critical first; order within a severity is preserved
export function sortBySeverity(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1))
}

export function overallStatus(alerts: Alert[]): SystemStatus['overall'] {
  if (alerts.some(a => a.severity === 'critical')) return 'critical'
  return alerts.length > 0 ? 'warning' : 'ok'
}
