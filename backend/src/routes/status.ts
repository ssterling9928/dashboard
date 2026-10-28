import { Router } from 'express'
import { listSynologyServices, listTitanServices } from './services.js'
import { getNasHelperHealth } from '../lib/nasHelper.js'
import {
  getHostSnapshot,
  getVaultHealth,
  getRecentReadings,
  getCurrentDiskUsage,
} from './metrics.js'
import {
  CPU_SUSTAINED_READINGS,
  HOST_LABELS,
  containerAlerts,
  overallStatus,
  reachabilityAlerts,
  resourceAlerts,
  sortBySeverity,
  vaultHardwareAlerts,
} from '../lib/alerts.js'
import type { Host, HostStatus, Service, SystemStatus } from '../types/types.js'

const router = Router()

function readingsFor(host: Host) {
  return {
    disks:     getCurrentDiskUsage(host),
    memory:    getRecentReadings(host, 'memory', 1)[0],
    cpuRecent: getRecentReadings(host, 'cpu', CPU_SUSTAINED_READINGS),
  }
}

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
      getNasHelperHealth(),
    ])

    const services = [synologyServices, titanServices]
      .flatMap(r => r.status === 'fulfilled' ? r.value : [])

    const alerts = sortBySeverity([
      ...reachabilityAlerts({
        vault: getHostSnapshot('synology'),
        titan: getHostSnapshot('titan'),
        synologyServices,
        titanServices,
        synologyHelper,
      }),
      ...vaultHardwareAlerts(getVaultHealth()),
      ...resourceAlerts('synology', readingsFor('synology')),
      ...resourceAlerts('titan', readingsFor('titan')),
      ...containerAlerts(services),
    ])

    const status: SystemStatus = {
      overall: overallStatus(alerts),
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
