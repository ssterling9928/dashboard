
import LogRow from './LogRow'
import HostToggle from './HostToggle'
import { ExternalLink } from 'lucide-react'
import { useLogs } from '../hooks/useLogs'
import { useHostSelection } from '../hooks/useHostSelection'
import { collapseRepeats } from '../utils/logs'

interface Props {
  grafanaUrl?: string
}

const SOURCE_NOTE = {
  synology: 'Vault system log (DSM)',
  titan:    'Titan container logs (Loki)',
}

export default function LogsTab({ grafanaUrl }: Props) {
  const [host, setHost] = useHostSelection('logs-host')
  const { data: logs, isLoading, isError } = useLogs(host)
  const groups = logs ? collapseRepeats(logs) : []

  return (
    <div>
      <div className="mb-6">
        <HostToggle value={host} onChange={setHost} />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Recent Logs</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {SOURCE_NOTE[host]}{logs ? ` · last ${logs.length} events` : ''}
          </p>
        </div>
        {grafanaUrl && (
          <a
            href={grafanaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800 rounded-full px-3 py-1 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Open Grafana
            <ExternalLink size={13} />
          </a>
        )}
      </div>

      {isLoading && <p className="text-sm text-gray-400 dark:text-gray-500">Loading logs...</p>}
      {isError && <p className="text-sm text-red-600 dark:text-red-400">Could not load logs for this host</p>}
      {logs && logs.length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500">No recent logs</p>}

      <div>
        {groups.map(({ log, count }) => (
          <LogRow key={log.id} log={log} count={count} />
        ))}
      </div>
    </div>
  )
}