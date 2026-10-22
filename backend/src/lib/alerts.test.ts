import { describe, expect, it } from 'vitest'
import {
  containerAlerts,
  overallStatus,
  reachabilityAlerts,
  resourceAlerts,
  sortBySeverity,
  vaultHardwareAlerts,
  type ReachabilityInput,
} from './alerts.js'
import type { HostSnapshot, VaultHealth } from './hostHealth.js'
import type { Alert, Service } from '../types/types.js'

const ok = <T>(value: T): PromiseFulfilledResult<T> => ({ status: 'fulfilled', value })
const failed = (reason: unknown): PromiseRejectedResult => ({ status: 'rejected', reason })

function snapshot(overrides: Partial<HostSnapshot> = {}): HostSnapshot {
  return {
    online: true, error: null, lastPolled: '2026-10-22T12:00:00Z',
    model: null, uptimeSec: 100, loadAvg: [0, 0, 0],
    ...overrides,
  }
}

function healthyVault(overrides: Partial<VaultHealth> = {}): VaultHealth {
  return {
    systemStatus: 1, temperature: 44, powerStatus: 1, systemFan: 1, cpuFan: 1,
    disks: [{ name: 'Disk 1', status: 1, health: 1, temperature: 32 }],
    raids: [{ name: 'Volume 1', status: 1 }],
    ...overrides,
  }
}

const titles = (alerts: Alert[]) => alerts.map(a => `${a.severity}: ${a.title}`)

// ── Reachability ──────────────────────────────────────────

describe('reachabilityAlerts', () => {
  const allUp: ReachabilityInput = {
    vault: snapshot(),
    titan: snapshot(),
    synologyServices: ok([]),
    titanServices: ok([]),
    synologyHelper: ok({ ok: true }),
  }

  it('raises nothing when everything answers', () => {
    expect(reachabilityAlerts(allUp)).toEqual([])
  })

  it('does not treat "not polled yet" as an outage', () => {
    const pending = snapshot({ online: false, error: null, lastPolled: null })
    expect(reachabilityAlerts({ ...allUp, vault: pending, titan: pending })).toEqual([])
  })

  it('flags Vault SNMP, DSM and the package helper separately', () => {
    const alerts = reachabilityAlerts({
      ...allUp,
      vault: snapshot({ online: false, error: 'RequestTimedOutError' }),
      synologyServices: failed(new Error('DSM down')),
      synologyHelper: failed(new Error('helper down')),
    })
    expect(titles(alerts)).toEqual([
      'critical: Vault not responding to SNMP',
      'critical: Vault DSM API unreachable',
      'warning: Vault package helper unreachable',
    ])
  })

  it('reports the underlying network error instead of "fetch failed"', () => {
    const fetchError = new Error('fetch failed', { cause: { code: 'ECONNREFUSED' } })
    const [alert] = reachabilityAlerts({ ...allUp, titanServices: failed(fetchError) })
    expect(alert).toMatchObject({ host: 'titan', title: 'Titan helper unreachable', detail: 'ECONNREFUSED' })
  })

  it('raises a single Titan alert when both the poll and the listing fail', () => {
    const alerts = reachabilityAlerts({
      ...allUp,
      titan: snapshot({ online: false, error: 'ECONNREFUSED' }),
      titanServices: failed(new Error('also down')),
    })
    expect(alerts).toHaveLength(1)
    expect(alerts[0]!.detail).toBe('ECONNREFUSED')
  })
})

// ── Containers ────────────────────────────────────────────

describe('containerAlerts', () => {
  const service = (Name: string, Status: string, Host: Service['Host']): Service => ({
    ServiceId: `${Host}:${Name}`, Name, Version: 'latest', Status, Uptime: '', Type: 'container', Host,
  })

  it('warns about every container that is not running', () => {
    const alerts = containerAlerts([
      service('grafana', 'running', 'titan'),
      service('sonarr', 'exited', 'titan'),
      service('node-exporter', 'paused', 'synology'),
    ])
    expect(alerts.map(a => [a.severity, a.title, a.detail])).toEqual([
      ['warning', 'sonarr is exited', 'Container on Titan'],
      ['warning', 'node-exporter is paused', 'Container on Vault'],
    ])
  })
})

// ── Resources ─────────────────────────────────────────────

describe('resourceAlerts', () => {
  const quiet = { disks: [], memory: 20, cpuRecent: [5, 5, 5] }

  it('uses 85% / 95% disk thresholds', () => {
    const alerts = resourceAlerts('synology', {
      ...quiet,
      disks: [
        { volume: '/volume1', pct: 84 },
        { volume: '/volume2', pct: 85 },
        { volume: '/volume3', pct: 95 },
      ],
    })
    expect(titles(alerts)).toEqual([
      'warning: Vault disk /volume2 at 85%',
      'critical: Vault disk /volume3 at 95%',
    ])
  })

  it('warns at 90% memory and ignores a missing reading', () => {
    expect(resourceAlerts('titan', { ...quiet, memory: 89 })).toEqual([])
    expect(titles(resourceAlerts('titan', { ...quiet, memory: 90 }))).toEqual(['warning: Titan memory at 90%'])
    expect(resourceAlerts('titan', { ...quiet, memory: undefined })).toEqual([])
  })

  it('only warns about CPU after 10 consecutive readings at 90% or more', () => {
    const high = (n: number) => Array(n).fill(95)
    expect(resourceAlerts('titan', { ...quiet, cpuRecent: high(9) })).toEqual([])
    expect(resourceAlerts('titan', { ...quiet, cpuRecent: [...high(9), 50] })).toEqual([])
    expect(titles(resourceAlerts('titan', { ...quiet, cpuRecent: [10, ...high(10)] })))
      .toEqual(['warning: Titan CPU sustained above 90%'])
  })
})

// ── Vault hardware ────────────────────────────────────────

describe('vaultHardwareAlerts', () => {
  it('raises nothing before the first health poll or when healthy', () => {
    expect(vaultHardwareAlerts(null)).toEqual([])
    expect(vaultHardwareAlerts(healthyVault())).toEqual([])
  })

  it('treats system and power faults as critical', () => {
    expect(titles(vaultHardwareAlerts(healthyVault({ systemStatus: 2, powerStatus: 2 })))).toEqual([
      'critical: Vault system status failed',
      'critical: Vault power supply fault',
    ])
  })

  it('names which fan failed', () => {
    expect(vaultHardwareAlerts(healthyVault({ systemFan: 2 }))[0]!.title).toBe('Vault system fan fault')
    expect(vaultHardwareAlerts(healthyVault({ systemFan: 2, cpuFan: 2 }))[0]!.title).toBe('Vault system and CPU fan fault')
  })

  it('warns at 70°C system and 60°C drive temperature', () => {
    expect(vaultHardwareAlerts(healthyVault({ temperature: 69 }))).toEqual([])
    expect(titles(vaultHardwareAlerts(healthyVault({
      temperature: 70,
      disks: [{ name: 'Disk 2', status: 1, health: 1, temperature: 60 }],
    })))).toEqual([
      'warning: Vault running hot (70°C)',
      'warning: Disk 2 running hot (60°C)',
    ])
  })

  it('maps Synology drive status and health codes to severities', () => {
    const alerts = vaultHardwareAlerts(healthyVault({
      disks: [
        { name: 'Disk 1', status: 3, health: 1, temperature: 30 },   // not initialized
        { name: 'Disk 2', status: 5, health: 1, temperature: 30 },   // crashed
        { name: 'Disk 3', status: 1, health: 2, temperature: 30 },   // health warning
        { name: 'Disk 4', status: 1, health: 4, temperature: 30 },   // failing
      ],
    }))
    expect(titles(alerts)).toEqual([
      'warning: Disk 1 not initialized',
      'critical: Disk 2 crashed',
      'warning: Disk 3 health warning',
      'critical: Disk 4 failing',
    ])
  })

  it('alerts on degraded, crashed and repairing RAID but not routine states', () => {
    const alerts = vaultHardwareAlerts(healthyVault({
      raids: [
        { name: 'Storage Pool 1', status: 11 },  // degraded
        { name: 'Storage Pool 2', status: 12 },  // crashed
        { name: 'Volume 1', status: 2 },         // repairing
        { name: 'Volume 2', status: 13 },        // data scrubbing — routine
      ],
    }))
    expect(titles(alerts)).toEqual([
      'critical: Storage Pool 1 degraded',
      'critical: Storage Pool 2 crashed',
      'warning: Volume 1 repairing',
    ])
  })
})

// ── Combining ─────────────────────────────────────────────

describe('sortBySeverity and overallStatus', () => {
  const a = (id: string, severity: Alert['severity']): Alert =>
    ({ id, severity, host: 'titan', title: id, detail: '' })

  it('puts critical alerts first and keeps the original order otherwise', () => {
    const sorted = sortBySeverity([a('w1', 'warning'), a('c1', 'critical'), a('w2', 'warning'), a('c2', 'critical')])
    expect(sorted.map(x => x.id)).toEqual(['c1', 'c2', 'w1', 'w2'])
  })

  it('is ok with no alerts, warning with only warnings, critical with any critical', () => {
    expect(overallStatus([])).toBe('ok')
    expect(overallStatus([a('w', 'warning')])).toBe('warning')
    expect(overallStatus([a('w', 'warning'), a('c', 'critical')])).toBe('critical')
  })
})
