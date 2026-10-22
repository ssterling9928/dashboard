// HostStatRow Component
// The four stat cards (CPU, memory, storage, network) for one host

import { Cpu, MemoryStick, HardDrive, Network } from 'lucide-react'
import type { Host, MetricSummary } from '@shared/types'
import StatCard from './StatCard'
import HostBadge from './HostBadge'
import { useMetrics } from '../hooks/useMetrics'

interface Props {
  host: Host
}

function current(metric?: MetricSummary): string {
  return metric ? `${metric.current}${metric.unit}` : '—'
}

function avgAndPeak(metric: MetricSummary): string {
  return `24h avg ${metric.average}${metric.unit} · peak ${metric.peak}${metric.unit}`
}

export default function HostStatRow({ host }: Props) {
  const { data: metrics, isLoading, isError } = useMetrics(host)
  const note = (build: (m: NonNullable<typeof metrics>) => string) =>
    isLoading ? 'Loading...' : isError || !metrics ? 'Unavailable' : build(metrics)

  return (
    <div>
      <div className="mb-2">
        <HostBadge host={host} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="CPU Usage"
          value={current(metrics?.cpu)}
          note={note(m => avgAndPeak(m.cpu))}
          icon={<Cpu size={16} />}
          percent={metrics?.cpu.current}
        />
        <StatCard
          label="Memory"
          value={current(metrics?.memory)}
          note={note(m => avgAndPeak(m.memory))}
          icon={<MemoryStick size={16} />}
          percent={metrics?.memory.current}
        />
        <StatCard
          label="Storage"
          value={current(metrics?.storage)}
          note={note(m => `${m.storage.volume ?? 'Disk'} used`)}
          icon={<HardDrive size={16} />}
          percent={metrics?.storage.current}
        />
        <StatCard
          label="Network"
          value={current(metrics?.network)}
          note={note(m => `24h peak ${m.network.peak} ${m.network.unit}`)}
          icon={<Network size={16} />}
        />
      </div>
    </div>
  )
}
