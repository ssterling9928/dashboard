
import { useState } from 'react'
import type { MetricSummary } from '@shared/types'
import MetricChart from './MetricChart'

interface MetricSection {
  label: string
  subtitle: string
  data: MetricSummary
}

interface Props {
  cpu: MetricSection
  disk: MetricSection
  network: MetricSection
}

type TimeRange = '1hr' | '6hrs' | '24hrs' | '7days'
const TIME_RANGES: TimeRange[] = ['1hr', '6hrs', '24hrs', '7days']

function ChartSection({ section }: { section: MetricSection }) {
  const [range, setRange] = useState<TimeRange>('24hrs')
  const { data } = section

  return (
    <div className="mb-10">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{section.label}</h3>
          <p className="text-xs text-gray-400">{section.subtitle}</p>
        </div>
        <div className="flex items-center border border-gray-200 rounded-full px-3 py-1">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as TimeRange)}
            className="bg-transparent outline-none cursor-pointer text-xs text-gray-600"
          >
            {TIME_RANGES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      <MetricChart data={data} />

      <div className="flex items-center justify-around mt-4 pt-4 border-t border-gray-100">
        <div className="text-center">
          <p className="text-xs text-gray-400">Current</p>
          <p className="text-xl font-bold text-gray-900">{data.current}{data.unit}</p>
        </div>
        <div className="w-px h-8 bg-gray-200" />
        <div className="text-center">
          <p className="text-xs text-gray-400">Average</p>
          <p className="text-xl font-bold text-gray-900">{data.average}{data.unit}</p>
        </div>
        <div className="w-px h-8 bg-gray-200" />
        <div className="text-center">
          <p className="text-xs text-gray-400">Peak</p>
          <p className="text-xl font-bold text-gray-900">{data.peak}{data.unit}</p>
        </div>
      </div>
    </div>
  )
}

export default function MonitoringTab({ cpu, disk, network }: Props) {
  return (
    <div>
      <ChartSection section={cpu} />
      <ChartSection section={disk} />
      <ChartSection section={network} />
    </div>
  )
}