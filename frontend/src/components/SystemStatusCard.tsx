// SystemStatusCard Component
// Overall status banner plus uptime / load / containers for each host

import type { HostStatus, SystemStatus } from '@shared/types'
import HostBadge from './HostBadge'
import { formatContainers, formatLoad, formatUptime } from '../utils/format'

interface Props {
  status?:  SystemStatus
  isError:  boolean
}

const OVERALL = {
  ok:       { dot: 'bg-green-400',  text: 'text-green-600 dark:text-green-400',  label: 'All Systems Operational' },
  warning:  { dot: 'bg-yellow-400', text: 'text-yellow-600 dark:text-yellow-400', label: 'Some Warnings' },
  critical: { dot: 'bg-red-500',    text: 'text-red-600 dark:text-red-400',    label: 'Issues Detected' },
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400 dark:text-gray-500">{label}</span>
      <span className="text-gray-700 dark:text-gray-300 font-medium">{value}</span>
    </div>
  )
}

function HostSection({ host }: { host: HostStatus }) {
  return (
    <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <HostBadge host={host.host} />
        <span className={`flex items-center gap-1.5 text-xs font-medium ${host.online ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          <span className={`w-2 h-2 rounded-full ${host.online ? 'bg-green-400' : 'bg-red-500'}`} />
          {host.online ? 'Online' : 'Offline'}
        </span>
      </div>
      {host.model && <Row label="Model" value={host.model} />}
      <Row label="Uptime"       value={formatUptime(host.uptimeSec)} />
      <Row label="Load Average" value={formatLoad(host.loadAvg)} />
      <Row label="Containers"   value={formatContainers(host.containers)} />
    </div>
  )
}

export default function SystemStatusCard({ status, isError }: Props) {
  const overall = status ? OVERALL[status.overall] : null

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">System Status</h3>

      {isError && !status && (
        <p className="text-sm text-red-600 dark:text-red-400">Dashboard backend unreachable</p>
      )}
      {!isError && !status && (
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
      )}

      {status && overall && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className={`w-2 h-2 rounded-full ${overall.dot}`} />
            <span className={`text-sm font-medium ${overall.text}`}>{overall.label}</span>
          </div>
          <div className="space-y-3">
            {status.hosts.map(host => <HostSection key={host.host} host={host} />)}
          </div>
        </>
      )}
    </div>
  )
}
