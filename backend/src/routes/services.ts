
import { Router } from 'express'
import { synoRequest } from '../lib/synology.js'
import { getTitanContainers, getTitanContainer, titanContainerAction } from '../lib/titan.js'
import type { Service, ServiceDetail, Host } from '../types/types.js'
const router = Router()

// ── Helpers ───────────────────────────────────────────────

function buildServiceUrl(name: string): string {
  return `https://${name}.home.sterling-dev.com`
}

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

// docker ps "Status" text looks like "Up 3 days" / "Exited (0) 2 hours ago"
function parseDockerPsUptime(status: string): string {
  return status?.startsWith('Up ') ? status.slice(3) : 'N/A'
}

function mapTitanPorts(ports: Record<string, Array<{ HostPort: string }> | null> | undefined): string[] {
  if (!ports) return []

  const mapped: string[] = []
  for (const [containerPort, bindings] of Object.entries(ports)) {
    if (!bindings) continue
    const [portNum, type = 'tcp'] = containerPort.split('/')
    for (const binding of bindings) {
      mapped.push(`${binding.HostPort}:${portNum}/${type}`)
    }
  }
  return mapped
}

function splitServiceId(id: string): { host: Host; name: string } {
  const separatorIndex = id.indexOf(':')
  if (separatorIndex === -1) {
    throw new Error(`Invalid service id: ${id}`)
  }

  const host = id.slice(0, separatorIndex) as Host
  const name = id.slice(separatorIndex + 1)

  if (host !== 'synology' && host !== 'titan') {
    throw new Error(`Unknown host in service id: ${id}`)
  }

  return { host, name }
}

// ── Synology ──────────────────────────────────────────────

export async function listSynologyServices(): Promise<Service[]> {
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

  return containers.map((c, i) => {
    const result    = detailResults[i]
    const detail    = result?.status === 'fulfilled' ? result.value : null
    const startedAt = detail?.details?.State?.StartedAt

    return {
      ServiceId:   `synology:${c.name}`,
      Name:        c.name,
      Version:     c.image?.split(':')[1] ?? 'unknown',
      Status:      parseStatus(c.status),
      Uptime:      formatUptime(startedAt),
      Type:        'container',
      Host:        'synology',
    }
  })
}

async function getSynologyServiceDetail(name: string): Promise<ServiceDetail> {
  const data    = await synoRequest('SYNO.Docker.Container', 'get', 1, { name })
  const details = data.details
  const profile = data.profile

  const Ports = (profile.port_bindings ?? []).map((p: any) =>
    `${p.host_port}:${p.container_port}/${p.type ?? 'tcp'}`
  )

  const startedInfo = details.State?.StartedAt
  const formattedStart = new Date(startedInfo).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).replace(',', '')

  return {
    ServiceId:        `synology:${profile.name}`,
    Name:             profile.name,
    Version:          profile.image?.split(':')[1] ?? 'latest',
    Status:           parseStatus(details.State?.Status ?? ''),
    Uptime:           formatUptime(details.State?.StartedAt ?? ''),
    Type:             'container',
    Host:             'synology',

    ImageId:          details.Image,
    ContainerId:      profile.id,
    RestartPolicy:    details.HostConfig?.RestartPolicy?.Name ?? 'none',
    Ports,
    Url:              buildServiceUrl(profile.name),
    Started:          formattedStart,
    Restarts:         details.RestartCount,
    Networks:         Object.keys(details.NetworkSettings.Networks)
  }
}

// ── Titan ─────────────────────────────────────────────────

export async function listTitanServices(): Promise<Service[]> {
  const containers = await getTitanContainers()

  return containers.map(c => ({
    ServiceId:   `titan:${c.name}`,
    Name:        c.name,
    Version:     c.image?.split(':')[1] ?? 'unknown',
    Status:      parseStatus(c.state),
    Uptime:      parseDockerPsUptime(c.status),
    Type:        'container',
    Host:        'titan',
  }))
}

async function getTitanServiceDetail(name: string): Promise<ServiceDetail> {
  const inspect = await getTitanContainer(name)
  const containerName = inspect.Name?.replace(/^\//, '') ?? name

  const startedInfo = inspect.State?.StartedAt ?? ''
  const formattedStart = startedInfo && !startedInfo.startsWith('0001')
    ? new Date(startedInfo).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).replace(',', '')
    : 'N/A'

  return {
    ServiceId:        `titan:${containerName}`,
    Name:             containerName,
    Version:          inspect.Config?.Image?.split(':')[1] ?? 'latest',
    Status:           parseStatus(inspect.State?.Status ?? ''),
    Uptime:           formatUptime(inspect.State?.StartedAt ?? ''),
    Type:             'container',
    Host:             'titan',

    ImageId:          inspect.Image,
    ContainerId:      inspect.Id,
    RestartPolicy:    inspect.HostConfig?.RestartPolicy?.Name ?? 'none',
    Ports:            mapTitanPorts(inspect.NetworkSettings?.Ports),
    Url:              buildServiceUrl(containerName),
    Started:          formattedStart,
    Restarts:         inspect.RestartCount,
    Networks:         Object.keys(inspect.NetworkSettings?.Networks ?? {})
  }
}

// ── GET /api/services ─────────────────────────────────────
router.get('/', async (_req, res, next) => {
  try {
    const [synologyResult, titanResult] = await Promise.allSettled([
      listSynologyServices(),
      listTitanServices(),
    ])

    if (synologyResult.status === 'rejected') {
      console.error('Failed to list Synology services:', synologyResult.reason)
    }
    if (titanResult.status === 'rejected') {
      console.error('Failed to list titan services:', titanResult.reason)
    }

    const services: Service[] = [
      ...(synologyResult.status === 'fulfilled' ? synologyResult.value : []),
      ...(titanResult.status === 'fulfilled' ? titanResult.value : []),
    ]

    res.json(services)
  } catch (err) {
    next(err)
  }
})

// ── GET /api/services/:id ─────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const { host, name } = splitServiceId(req.params.id)

    const detail = host === 'synology'
      ? await getSynologyServiceDetail(name)
      : await getTitanServiceDetail(name)

    res.json(detail)
  } catch (err) {
    next(err)
  }
})

// GET /api/services/:id/inspect
router.get('/:id/inspect', async (req, res, next) => {
  try {
    const { host, name } = splitServiceId(req.params.id)

    const data = host === 'synology'
      ? await synoRequest('SYNO.Docker.Container', 'get', 1, { name })
      : await getTitanContainer(name)

    res.json(data)
  } catch (err) {
    next(err)
  }
})

// ── POST /api/services/:id/start ──────────────────────────
router.post('/:id/start', async (req, res, next) => {
  try {
    const { host, name } = splitServiceId(req.params.id)

    if (host === 'synology') {
      await synoRequest('SYNO.Docker.Container', 'start', 1, { name })
    } else {
      await titanContainerAction(name, 'start')
    }

    res.json({ ok: true, message: `${name} started` })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/services/:id/stop ───────────────────────────
router.post('/:id/stop', async (req, res, next) => {
  try {
    const { host, name } = splitServiceId(req.params.id)

    if (host === 'synology') {
      await synoRequest('SYNO.Docker.Container', 'stop', 1, { name })
    } else {
      await titanContainerAction(name, 'stop')
    }

    res.json({ ok: true, message: `${name} stopped` })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/services/:id/restart ───────────────────────
router.post('/:id/restart', async (req, res, next) => {
  try {
    const { host, name } = splitServiceId(req.params.id)

    if (host === 'synology') {
      await synoRequest('SYNO.Docker.Container', 'stop', 1, { name })
      await new Promise(r => setTimeout(r, 2000))
      await synoRequest('SYNO.Docker.Container', 'start', 1, { name })
    } else {
      await titanContainerAction(name, 'restart')
    }

    res.json({ ok: true, message: `${name} restarted` })
  } catch (err) {
    next(err)
  }
})



export default router
