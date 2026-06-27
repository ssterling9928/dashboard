import { Router } from 'express'
import { synoRequest } from '../lib/synology.js'
import type { LogEntry } from '../types/types.js'

const router = Router()

function parseLevel(prio?: string): LogEntry['level'] {
  switch ((prio ?? '').toLowerCase()) {
    case 'err':
    case 'error':
    case 'crit':
    case 'critical':
    case 'alert':
    case 'emerg':
    case 'emergency':
      return 'error'
    case 'warn':
    case 'warning':
      return 'warning'
    default:
      return 'info'
  }
}

router.get('/', async (req, res, next) => {
  try {
    const limit = parseInt((req.query.limit as string) ?? '50', 10)

    // 50 logs seems to be the max this api will get
    const data = await synoRequest('SYNO.Core.SyslogClient.Status', 'latestlog_get', 1, {
      start: '0',
      limit: String(limit),
    })

    const rows = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.logs)
        ? data.logs
        : Array.isArray(data)
          ? data
          : []

    const logs: LogEntry[] = rows.map((item: any, i: number) => ({
      id: 'log_'+ (i + 1),
      timestamp: `${item.ldate ?? ''} ${item.ltime ?? ''}`.trim(),
      level: parseLevel(item.prio),
      source: [item.host, item.prog].filter(Boolean).join(' / ') || 'System',
      message: item.msg ?? '',
    }))

    res.json(logs)
  } catch (err) {
    next(err)
  }
})

export default router