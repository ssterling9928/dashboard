
import type { LogEntry } from '@shared/types'
import LogBadge from './LogBadge'

export default function LogRow({ log }: { log: LogEntry }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-100 text-sm">
      <span className="text-gray-400 text-xs whitespace-nowrap w-36 shrink-0">
        {log.timestamp}
      </span>
      <div className="shrink-0">
        <LogBadge level={log.level} />
      </div>
      <span className="font-semibold text-gray-900 w-40 shrink-0 truncate">
        {log.source}
      </span>
      <span className="text-gray-500 truncate">{log.message}</span>
    </div>
  )
}