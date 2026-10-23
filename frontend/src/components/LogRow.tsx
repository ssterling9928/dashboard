
import type { LogEntry } from '@shared/types'
import LogBadge from './LogBadge'

interface Props {
  log:    LogEntry
  count?: number
}

export default function LogRow({ log, count = 1 }: Props) {
  return (
    <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 py-2 border-b border-gray-100 dark:border-gray-800 text-sm">
      <span className="text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap sm:w-36 shrink-0">
        {log.timestamp}
      </span>
      <div className="shrink-0">
        <LogBadge level={log.level} />
      </div>
      <span className="font-semibold text-gray-900 dark:text-gray-100 min-w-0 sm:w-40 shrink-0 truncate">
        {log.source}
      </span>
      {count > 1 && (
        <span className="shrink-0 text-xs font-semibold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-full px-2 py-0.5">
          {count}×
        </span>
      )}
      <span className="text-gray-500 dark:text-gray-400 basis-full sm:basis-auto min-w-0 break-words sm:truncate">{log.message}</span>
    </div>
  )
}