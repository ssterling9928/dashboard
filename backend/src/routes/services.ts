
import { Router } from 'express'
import { synoRequest } from '../lib/synology.js'
import type { Service, ServiceDetail } from '../types/types.js'
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

    // GET API DATA - set variable
    const listData = await synoRequest('SYNO.Docker.Container', 'list', 1, {
      limit:  '100',
      offset: '0',
    })

    // Map all containers to object
    const containers: any[] = listData.containers ?? []

    // Get detailed information for each container
    const detailResults = await Promise.allSettled(
      containers.map(c =>
        synoRequest('SYNO.Docker.Container', 'get', 1, { name: c.name })
      )
    )

    // Return all API info
    const services: Service[] = containers.map((c, i) => {
      const result    = detailResults[i]
      const detail    = result?.status === 'fulfilled' ? result.value : null
      const startedAt = detail?.details?.State?.StartedAt

      return {
        ServiceId:   c.name,
        Name:        c.name,
        Version:     c.image?.split(':')[1] ?? 'unknown',
        Status:      parseStatus(c.status),
        Uptime:      formatUptime(startedAt),
        Type:        'container',
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

    // GET API INFO - set variables 
    const data    = await synoRequest('SYNO.Docker.Container', 'get', 1, { name: req.params.id })
    const UrlAPI  = await synoRequest('SYNO.Core.AppPortal.ReverseProxy', 'list', 1)
    const details = data.details
    const profile = data.profile

    // Map port info to object
    const Ports = (profile.port_bindings ?? []).map((p: any) =>
      `${p.host_port}:${p.container_port}/${p.type ?? 'tcp'}`
    )

    // Match services with description names - to get public hostnames
    const URLmatch = UrlAPI.entries.find((e: any) =>
      e.description.toLowerCase() === profile.name.toLowerCase()
    )

    // Format datetime started
    const startedInfo = details.State?.StartedAt
    const formattedStart = new Date(startedInfo).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).replace(',', '')

    // Return all API info
    const detail: ServiceDetail = {
      
      ServiceId:        profile.name,
      Name:             profile.name,
      Version:          profile.image?.split(':')[1] ?? 'latest',
      Status:           parseStatus(details.State?.Status ?? ''),
      Uptime:           formatUptime(details.State?.StartedAt ?? ''),
      Type:             'container',

      ImageId:          details.Image,
      ContainerId:      profile.id,
      RestartPolicy:    details.HostConfig?.RestartPolicy?.Name ?? 'none',
      Ports,
      PublicUrl:        URLmatch ? `https://${URLmatch.frontend.fqdn}` : "null",

      // same as PublicURL - just puts .internal on end instead (All my services are configured this way)
      InternalUrl:      URLmatch ? `https://${URLmatch.frontend.fqdn.split('.')[0]}.internal` : "null",
      Started:          formattedStart,
      Restarts:         details.RestartCount,
      Networks:         Object.keys(details.NetworkSettings.Networks)
    }

    res.json(detail)
  } catch (err) {
    next(err)
  }
})

// GET /api/services/:id/inspect
router.get('/:id/inspect', async (req, res, next) => {
  try {
    const data = await synoRequest('SYNO.Docker.Container', 'get', 1, { name: req.params.id })
    res.json(data)
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