import { Router } from 'express'
import { synoRequest } from '../lib/synology.js'
import { queryLogs } from '../lib/loki.js'
import type { Host, LogEntry } from '../types/types.js'

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

// "2026-10-22 12:45:55" in the server's local time — matches DSM's log format
function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString('sv-SE').replace('T', ' ')
}

async function getSynologyLogs(limit: number): Promise<LogEntry[]> {
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

  return rows.slice(0, limit).map((item: any, i: number) => ({
    id: 'log_'+ (i + 1),
    timestamp: `${item.ldate ?? ''} ${item.ltime ?? ''}`.trim(),
    level: parseLevel(item.prio),
    source: [item.host, item.prog].filter(Boolean).join(' / ') || 'System',
    message: item.msg ?? '',
  }))
}

// titan's container logs are shipped to Loki by Alloy. Loki's own logs are
// excluded — they would mostly be about the dashboard querying it.
async function getTitanLogs(limit: number): Promise<LogEntry[]> {
  const entries = await queryLogs('{host="titan", container!="loki"}', limit)

  return entries.map((entry, i) => ({
    id: 'log_' + (i + 1),
    timestamp: formatTimestamp(Number(BigInt(entry.timestampNs) / 1_000_000n)),
    level: parseLevel(entry.labels.detected_level),
    source: entry.labels.container ?? entry.labels.service_name ?? 'titan',
    message: entry.line,
  }))
}

// GET /api/logs?host=synology|titan&limit=50
router.get('/', async (req, res, next) => {
  try {
    const limit = parseInt((req.query.limit as string) ?? '50', 10) || 50
    const hostParam = String(req.query.host ?? 'synology')

    if (hostParam !== 'synology' && hostParam !== 'titan') {
      return res.status(400).json({ error: `Unknown host: ${hostParam}` })
    }
    const host = hostParam as Host

    const logs = host === 'synology'
      ? await getSynologyLogs(limit)
      : await getTitanLogs(limit)

    res.json(logs)
  } catch (err) {
    next(err)
  }
})

export default router