import { Router, type Request, type Response, type NextFunction } from 'express'
import type { Package, PackageDetail } from './../types/types.js'
import { getJson } from '../lib/http.js'

const router = Router()

const SYNO_HELPER_URL =
  process.env.SYNO_HELPER_URL?.replace(/\/+$/, '') ?? 'http://YOUR_NAS_IP:4111'

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