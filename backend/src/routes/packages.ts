import { Router, type Request, type Response, type NextFunction } from 'express'
import type { Package, PackageDetail } from './../types/types.js'

const router = Router()

const SYNO_HELPER_URL =
  process.env.SYNO_HELPER_URL?.replace(/\/+$/, '') ?? 'http://YOUR_NAS_IP:4111'

async function getJson<T>(url: string): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Helper request failed (${response.status}): ${body || response.statusText}`)
    }

    return (await response.json()) as T
  } finally {
    clearTimeout(timeout)
  }
}

router.get(
  '/',
  async (_req: Request, res: Response<Package[]>, next: NextFunction) => {
    try {
      const data = await getJson<Package[]>(`${SYNO_HELPER_URL}/packages`)
      res.json(data)
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/:id',
  async (
    req: Request<{ id: string }>,
    res: Response<PackageDetail>,
    next: NextFunction
  ) => {
    try {
      const data = await getJson<PackageDetail>(
        `${SYNO_HELPER_URL}/packages/${encodeURIComponent(req.params.id)}`
      )
      res.json(data)
    } catch (err) {
      next(err)
    }
  }
)

export default router