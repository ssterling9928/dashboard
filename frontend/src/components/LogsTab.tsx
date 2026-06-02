
import type { LogEntry } from '@shared/types'
import LogRow from './LogRow'
import { ExternalLink } from 'lucide-react'

interface Props {
  logs: LogEntry[]
  grafanaUrl?: string
}

export default function LogsTab({ logs, grafanaUrl }: Props) {
  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Recent Logs</h3>
          <p className="text-xs text-gray-400">Last 100 events</p>
        </div>
        {grafanaUrl && (
          <a
            href={grafanaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 rounded-full px-3 py-1 hover:bg-gray-50 transition-colors"
          >
            Open Grafana
            <ExternalLink size={13} />
          </a>
        )}
      </div>

      <div>
        {logs.map((log) => (
          <LogRow key={log.id} log={log} />
        ))}
      </div>
    </div>
  )
}