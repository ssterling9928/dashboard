import { Router } from 'express'
import { synoRequest } from '../lib/synology.js'
import type { LogEntry } from '../../../shared/types/index.js'

const router = Router()

function parseLevel(level: string): LogEntry['level'] {
  switch (level?.toLowerCase()) {
    case 'err':
    case 'error':   return 'error'
    case 'warn':
    case 'warning': return 'warning'
    default:        return 'info'
  }
}

router.get('/', async (req, res, next) => {
  try {
    const limit = parseInt((req.query.limit as string) ?? '100', 10)

    const data = await synoRequest('SYNO.LogCenter.Log', 'list', 2, {
      limit:  String(limit),
      offset: '0',
    })

    const logs: LogEntry[] = (data.items ?? []).map((item: any, i: number) => ({
      id:        `log-${i}`,
      timestamp: item.time ?? '',
      level:     parseLevel(item.severity ?? item.type ?? ''),
      source:    item.hostname ?? item.computer ?? 'System',
      message:   item.logmsg ?? item.desc ?? '',
    }))

    res.json(logs)
  } catch (err) {
    next(err)
  }
})

export default router