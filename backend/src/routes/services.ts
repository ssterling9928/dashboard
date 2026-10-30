
import { Router, type Request } from 'express'
import { getNasContainers, getNasContainer, nasContainerAction } from '../lib/nasHelper.js'
import { getTitanContainers, getTitanContainer, titanContainerAction } from '../lib/titan.js'
import { toService, toServiceDetail } from '../lib/containers.js'
import { sanitizeInspect } from '../lib/inspect.js'
import { requestUser } from '../lib/requestGuards.js'
import { splitServiceId } from '../lib/parsers.js'
import type { Host, Service } from '../types/types.js'
const router = Router()

// One line per container action: who, what, and whether it worked
function audit(req: Request, action: string, outcome: 'ok' | 'failed') {
  const user = requestUser(req, req.app.locals.proxyEnforced === true)
  console.log(`[audit] ${new Date().toISOString()} user=${user} ${action} ${req.params.id} ${outcome}`)
}

// ── Container helpers ─────────────────────────────────────
// Vault's containers go through the NAS helper and titan's through the titan
// helper. Both wrap the docker CLI, so they answer in the same shapes.

const helpers = {
  synology: {
    list:    getNasContainers,
    inspect: getNasContainer,
    action:  nasContainerAction,
  },
  titan: {
    list:    getTitanContainers,
    inspect: getTitanContainer,
    action:  titanContainerAction,
  },
} satisfies Record<Host, unknown>

async function listServices(host: Host): Promise<Service[]> {
  const containers = await helpers[host].list()
  return containers.map(c => toService(host, c))
}

export function listSynologyServices(): Promise<Service[]> {
  return listServices('synology')
}

export function listTitanServices(): Promise<Service[]> {
  return listServices('titan')
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

    const detail = toServiceDetail(host, await helpers[host].inspect(name), name)

    res.json(detail)
  } catch (err) {
    next(err)
  }
})

// GET /api/services/:id/inspect
router.get('/:id/inspect', async (req, res, next) => {
  try {
    const { host, name } = splitServiceId(req.params.id)

    // The helpers already allow-list the inspect output; sanitizing again
    // here keeps that true even if a helper is out of date
    res.json(sanitizeInspect(await helpers[host].inspect(name)))
  } catch (err) {
    next(err)
  }
})

// ── POST /api/services/:id/start ──────────────────────────
router.post('/:id/start', async (req, res, next) => {
  try {
    const { host, name } = splitServiceId(req.params.id)

    await helpers[host].action(name, 'start')

    audit(req, 'start', 'ok')
    res.json({ ok: true, message: `${name} started` })
  } catch (err) {
    audit(req, 'start', 'failed')
    next(err)
  }
})

// ── POST /api/services/:id/stop ───────────────────────────
router.post('/:id/stop', async (req, res, next) => {
  try {
    const { host, name } = splitServiceId(req.params.id)

    await helpers[host].action(name, 'stop')

    audit(req, 'stop', 'ok')
    res.json({ ok: true, message: `${name} stopped` })
  } catch (err) {
    audit(req, 'stop', 'failed')
    next(err)
  }
})

// ── POST /api/services/:id/restart ───────────────────────
router.post('/:id/restart', async (req, res, next) => {
  try {
    const { host, name } = splitServiceId(req.params.id)

    await helpers[host].action(name, 'restart')

    audit(req, 'restart', 'ok')
    res.json({ ok: true, message: `${name} restarted` })
  } catch (err) {
    audit(req, 'restart', 'failed')
    next(err)
  }
})



export default router
