import { useState } from 'react'
import type { Host } from '@shared/types'
import MetricChart from './MetricChart'
import HostToggle from './HostToggle'
import { useMetric } from '../hooks/useMetrics'
import { useHostSelection } from '../hooks/useHostSelection'
import { TIME_RANGES, loadRange, saveRange } from '../utils/timeRanges'

interface MetricSection {
  label: string
  type: string
  params?: string
}

interface Props {
  cpu: MetricSection
  disk: MetricSection
  network: MetricSection
}

function ChartSection({ section, host }: { section: MetricSection; host: Host }) {
  const [hours, setHours] = useState(() => loadRange(section.type))
  const { data } = useMetric(section.type, hours, host, section.params)
  const subtitle = TIME_RANGES.find(r => r.hours === hours)?.subtitle ?? ''

  function handleRangeChange(value: number) {
    setHours(value)
    saveRange(section.type, value)
  }

  return (
    <div className="mb-10">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{section.label}</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500">{subtitle}</p>
        </div>
        <div className="flex items-center border border-gray-200 dark:border-gray-800 rounded-full px-3 py-1">
          <select
            value={hours}
            onChange={(e) => handleRangeChange(Number(e.target.value))}
            className="bg-transparent outline-none cursor-pointer text-xs text-gray-600 dark:text-gray-400"
          >
            {TIME_RANGES.map((r) => (
              <option key={r.hours} value={r.hours}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      {!data
        ? <p className="text-sm text-gray-400 dark:text-gray-500 h-[200px] flex items-center justify-center">Loading...</p>
        : <>
            <MetricChart data={data} hours={hours} />

            <div className="flex items-center justify-around mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
              <div className="text-center">
                <p className="text-xs text-gray-400 dark:text-gray-500">Current</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{data.current}{data.unit}</p>
              </div>
              <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
              <div className="text-center">
                <p className="text-xs text-gray-400 dark:text-gray-500">Average</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{data.average}{data.unit}</p>
              </div>
              <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
              <div className="text-center">
                <p className="text-xs text-gray-400 dark:text-gray-500">Peak</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{data.peak}{data.unit}</p>
              </div>
            </div>
          </>
      }
    </div>
  )
}

export default function MonitoringTab({ cpu, disk, network }: Props) {
  const [host, setHost] = useHostSelection('monitoring-host')

  return (
    <div>
      <div className="mb-6">
        <HostToggle value={host} onChange={setHost} />
      </div>
      <ChartSection section={cpu}     host={host} />
      <ChartSection section={disk}    host={host} />
      <ChartSection section={network} host={host} />
    </div>
  )
}
