// SystemStatusCard Component
// Overall status banner plus uptime / load / containers for each host

import type { HostStatus, SystemStatus } from '@shared/types'
import HostBadge from './HostBadge'

interface Props {
  status?:  SystemStatus
  isError:  boolean
}

const OVERALL = {
  ok:       { dot: 'bg-green-400',  text: 'text-green-600',  label: 'All Systems Operational' },
  warning:  { dot: 'bg-yellow-400', text: 'text-yellow-600', label: 'Some Warnings' },
  critical: { dot: 'bg-red-500',    text: 'text-red-600',    label: 'Issues Detected' },
}

function formatUptime(seconds: number | null): string {
  if (seconds === null) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatLoad(load: [number, number, number] | null): string {
  return load ? load.map(n => n.toFixed(2)).join(', ') : '—'
}

function formatContainers(containers: HostStatus['containers']): string {
  return containers ? `${containers.running} / ${containers.total} running` : '—'
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-700 font-medium">{value}</span>
    </div>
  )
}

function HostSection({ host }: { host: HostStatus }) {
  return (
    <div className="pt-3 border-t border-gray-100 space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <HostBadge host={host.host} />
        <span className={`flex items-center gap-1.5 text-xs font-medium ${host.online ? 'text-green-600' : 'text-red-600'}`}>
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
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">System Status</h3>

      {isError && !status && (
        <p className="text-sm text-red-600">Dashboard backend unreachable</p>
      )}
      {!isError && !status && (
        <p className="text-sm text-gray-400">Loading...</p>
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
