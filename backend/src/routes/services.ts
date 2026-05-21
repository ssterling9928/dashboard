
import { Router } from 'express'
import { synoRequest } from '../lib/synology.js'
import type { Service, ServiceDetail } from '../../../shared/types.'

const router = Router()

// ── Helpers ───────────────────────────────────────────────

function parseStatus(state: string): string {
  switch (state?.toLowerCase()) {
    case 'running': return 'running'
    case 'exited':  return 'exited'
    case 'stopped': return 'stopped'
    case 'paused':  return 'paused'
    default:        return 'unknown'
  }
}

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

// ── GET /api/services ─────────────────────────────────────
router.get('/', async (_req, res, next) => {
  try {
    const listData = await synoRequest('SYNO.Docker.Container', 'list', 1, {
      limit:  '100',
      offset: '0',
    })

    const containers: any[] = listData.containers ?? []

    const detailResults = await Promise.allSettled(
      containers.map(c =>
        synoRequest('SYNO.Docker.Container', 'get', 1, { name: c.name })
      )
    )

    const services: Service[] = containers.map((c, i) => {
      const result    = detailResults[i]
      const detail    = result?.status === 'fulfilled' ? result.value : null
      const startedAt = detail?.details?.State?.StartedAt ?? ''

      return {
        id:          c.name,
        name:        c.name,
        description: c.image?.split(':')[0] ?? '',
        version:     c.image?.split(':')[1] ?? 'latest',
        status:      parseStatus(c.status),
        restarts:    detail?.details?.RestartCount ?? c.restart_count ?? 0,
        uptime:      formatUptime(startedAt),
        type:        'container',
      }
    })

    res.json(services)
  } catch (err) {
    next(err)
  }
})

// ── GET /api/services/:id ─────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const data    = await synoRequest('SYNO.Docker.Container', 'get', 1, { name: req.params.id })
    const details = data.details
    const profile = data.profile

    const ports = (profile.port_bindings ?? []).map((p: any) =>
      `${p.host_port}:${p.container_port}/${p.type ?? 'tcp'}`
    )

    const detail: ServiceDetail = {
      // Base Service fields
      id:          profile.name,
      name:        profile.name,
      description: profile.image?.split(':')[0] ?? '',
      version:     profile.image?.split(':')[1] ?? 'latest',
      status:      parseStatus(details.State?.Status ?? ''),
      restarts:    details.RestartCount ?? 0,
      uptime:      formatUptime(details.State?.StartedAt ?? ''),
      type:        'container',

      // Detail-only fields
      image:         profile.image,
      containerId:   profile.id,
      containerName: profile.name,
      restartPolicy: details.HostConfig?.RestartPolicy?.Name ?? 'none',
      internalIp:    details.NetworkSettings?.IPAddress,
      ports,
      started:       details.State?.StartedAt
                       ? new Date(details.State.StartedAt).toLocaleString()
                       : 'N/A',
    }

    res.json(detail)
  } catch (err) {
    next(err)
  }
})

// ── POST /api/services/:id/start ──────────────────────────
router.post('/:id/start', async (req, res, next) => {
  try {
    await synoRequest('SYNO.Docker.Container', 'start', 1, { name: req.params.id })
    res.json({ ok: true, message: `${req.params.id} started` })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/services/:id/stop ───────────────────────────
router.post('/:id/stop', async (req, res, next) => {
  try {
    await synoRequest('SYNO.Docker.Container', 'stop', 1, { name: req.params.id })
    res.json({ ok: true, message: `${req.params.id} stopped` })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/services/:id/restart ───────────────────────
router.post('/:id/restart', async (req, res, next) => {
  try {
    await synoRequest('SYNO.Docker.Container', 'stop', 1, { name: req.params.id })
    await new Promise(r => setTimeout(r, 2000))
    await synoRequest('SYNO.Docker.Container', 'start', 1, { name: req.params.id })
    res.json({ ok: true, message: `${req.params.id} restarted` })
  } catch (err) {
    next(err)
  }
})

export default router