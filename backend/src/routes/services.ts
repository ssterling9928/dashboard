import { Router } from 'express'
import { synoRequest } from '../lib/synology.js'
import type { Service, ServiceDetail } from '../types/index.js'

const router = Router()

// Helper — convert Synology container status to our status type
function parseStatus(state: string): Service['status'] {
  switch (state?.toLowerCase()) {
    case 'running': return 'running'
    case 'exited':
    case 'stopped': return 'stopped'
    case 'paused':  return 'paused'
    default:        return 'unknown'
  }
}

// Helper — calculate uptime from an ISO start timestamp
function formatUptime(startedAt: string): string {
  if (!startedAt || startedAt.startsWith('0001')) return 'N/A'
  const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s`
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

// 
router.get('/', async (_req, res, next) => {
  try {
    // Step 1: get the container list
    const listData = await synoRequest('SYNO.Docker.Container', 'list', 1, {
      limit:  '100',
      offset: '0',
    })

    const containers: any[] = listData.containers ?? []

    // Step 2: fetch details for all containers in parallel
    const detailResults = await Promise.allSettled(
      containers.map(c =>
        synoRequest('SYNO.Docker.Container', 'get', 1, { name: c.name })
      )
    )

    
    const services: Service[] = containers.map((c, i) => {
  const result = detailResults[i]
  const detail = result?.status === 'fulfilled' ? result.value : null

  const startedAt = detail?.details?.State?.StartedAt ?? ''

  return {
    id:            c.name,
    name:          c.name,
    status:        parseStatus(c.status),
    health:        c.status === 'running' ? 'healthy' : 'unhealthy',
    image:         c.image,
    uptime:        formatUptime(startedAt),
    restarts:      detail?.details?.RestartCount ?? c.restart_count ?? 0,
    containerName: c.name,
    containerId:   c.id,
  }
})

    res.json(services)
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const data = await synoRequest('SYNO.Docker.Container', 'get', 1, {
      name: req.params.id,
    })

    const details = data.details
    const profile = data.profile

    const ports = (profile.port_bindings ?? []).map((p: any) =>
      `${p.host_port}:${p.container_port}/${p.type ?? 'tcp'}`
    )

    const detail: ServiceDetail = {
      id:            profile.name,
      name:          profile.name,
      status:        parseStatus(details.State?.Status ?? ''),
      health:        details.State?.Running ? 'healthy' : 'unhealthy',
      image:         profile.image,
      uptime:        formatUptime(details.State?.StartedAt ?? ''),
      restarts:      details.RestartCount ?? 0,
      containerName: profile.name,
      containerId:   profile.id,
      ports,
      internalIp:    details.NetworkSettings?.IPAddress || profile.network_mode || 'N/A',
      started:       details.State?.StartedAt
                       ? new Date(details.State.StartedAt).toLocaleString()
                       : 'N/A',
      restartPolicy: profile.HostConfig?.RestartPolicy?.Name
                       ?? details.HostConfig?.RestartPolicy?.Name
                       ?? 'none',
    }

    res.json(detail)
  } catch (err) {
    next(err)
  }
})

// ── POST /api/services/:id/restart ────────────────────────
router.post('/:id/restart', async (req, res, next) => {
  try {
    // Stop first
    await synoRequest('SYNO.Docker.Container', 'stop', 1, {
      name: req.params.id,
    })

    // Wait 2 seconds then start
    await new Promise(r => setTimeout(r, 2000))

    await synoRequest('SYNO.Docker.Container', 'start', 1, {
      name: req.params.id,
    })

    res.json({ ok: true, message: `${req.params.id} restarted successfully` })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/services/:id/stop ───────────────────────────
router.post('/:id/stop', async (req, res, next) => {
  try {
    await synoRequest('SYNO.Docker.Container', 'stop', 1, {
      name: req.params.id,
    })
    res.json({ ok: true, message: `${req.params.id} stopped` })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/services/:id/start ──────────────────────────
router.post('/:id/start', async (req, res, next) => {
  try {
    await synoRequest('SYNO.Docker.Container', 'start', 1, {
      name: req.params.id,
    })
    res.json({ ok: true, message: `${req.params.id} started` })
  } catch (err) {
    next(err)
  }
})

export default router