import { Router, type Request, type Response, type NextFunction } from 'express'
import type { Package, PackageDetail } from './../types/types.js'
import { getNasPackage, getNasPackages } from '../lib/nasHelper.js'

const router = Router()

router.get(
  '/',
  async (_req: Request, res: Response<Package[]>, next: NextFunction) => {
    try {
      const data = await getNasPackages()
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
      const data = await getNasPackage(req.params.id)
      res.json(data)
    } catch (err) {
      next(err)
    }
  }
)

export default router