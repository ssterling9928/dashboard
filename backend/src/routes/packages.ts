

import { Router } from 'express'
import { synoRequest } from '../lib/synology.js'
import type { Package, PackageDetail } from '../types/types.js'

const router = Router()

function parsePackageStatus(status: string): string {
  switch (status?.toLowerCase()) {
    case 'running':  return 'running'
    case 'stopped':  return 'stopped'
    case 'disabled': return 'stopped'
    default:         return 'unknown'
  }
}

// ── GET /api/packages ─────────────────────────────────────
router.get('/', async (_req, res, next) => {
  try {
    const data = await synoRequest('SYNO.Core.Package', 'list', 2, {
      additional: '"description","description_enu","dependent_packages","beta","distributor","distributor_url","maintainer","maintainer_url","dsm_apps","dsm_app_page","dsm_app_launch_name","report_beta_url","support_center","startable","installed_info","support_url","is_uninstall_pages","install_type","autoupdate","silent_upgrade","installing_progress","ctl_uninstall","updated_at","status","url","available_operation","install_type"',
      list: 'all'
    })

    const packages: Package[] = (data.packages ?? []).map((p: any) => ({
      id:          p.id,
      name:        p.name,
      description: p.description ?? '',
      version:     p.version ?? '',
      status:      parsePackageStatus(p.status),
      type:        'package',
    }))

    res.json(packages)
  } catch (err) {
    next(err)
  }
})

// ── GET /api/packages/:id ─────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const data = await synoRequest('SYNO.Core.Package', 'get', 2, {
      id: req.params.id,
      additional: '["description","thumbnail","author","install_type","dsmuidir"]',
    })

    const p = data.package ?? data

    const detail: PackageDetail = {
      id:          p.id,
      name:        p.name,
      description: p.description ?? '',
      version:     p.version ?? '',
      status:      parsePackageStatus(p.status),
      type:        'package',
      author:      p.author ?? '',
      installPath: p.install_type ?? '',
      size:        p.size ? `${(p.size / 1024 / 1024).toFixed(1)} MB` : 'N/A',
      thumbnail:   p.thumbnail?.[0] ?? '',
      dsmApps:     p.dsmuidir ?? [],
    }

    res.json(detail)
  } catch (err) {
    next(err)
  }
})

// ── POST /api/packages/:id/start ──────────────────────────
router.post('/:id/start', async (req, res, next) => {
  try {
    await synoRequest('SYNO.Core.Package.Control', 'start', 1, { id: req.params.id })
    res.json({ ok: true, message: `${req.params.id} started` })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/packages/:id/stop ───────────────────────────
router.post('/:id/stop', async (req, res, next) => {
  try {
    await synoRequest('SYNO.Core.Package.Control', 'stop', 1, { id: req.params.id })
    res.json({ ok: true, message: `${req.params.id} stopped` })
  } catch (err) {
    next(err)
  }
})

export default router