
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import type { MetricSummary } from '@shared/types'

interface Props {
  data: MetricSummary
  hours: number
}

// Axis: "2:35 PM" for short ranges, "2 PM" once the chart spans many hours
function formatTick(time: string, hours: number): string {
  return new Date(time).toLocaleTimeString([], hours > 6
    ? { hour: 'numeric' }
    : { hour: 'numeric', minute: '2-digit' })
}

// Tooltip: "Tue, Oct 21, 2:35 PM"
function formatTooltipLabel(time: string): string {
  return new Date(time).toLocaleString([], {
    weekday: 'short',
    month:   'short',
    day:     'numeric',
    hour:    'numeric',
    minute:  '2-digit',
  })
}

export default function MetricChart({ data, hours }: Props) {
  const isPercent = data.unit === '%'

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart
        data={data.history}
        margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis
          dataKey="time"
          tickFormatter={(t) => formatTick(t, hours)}
          minTickGap={40}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={isPercent ? [0, 100] : ['auto', 'auto']}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}${data.unit}`}
        />
        <Tooltip
          formatter={(value) => {
            if (value === undefined || value === null) return ['', '']
            return [`${Number(value)}${data.unit}`, '']
          }}
          labelFormatter={(t) => formatTooltipLabel(String(t))}
          labelStyle={{ color: '#6b7280', fontSize: 11 }}
          contentStyle={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: 12,
          }}
        />
        <Line
          type="linear"
          dataKey="value"
          stroke="#4f46e5"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: '#4f46e5' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}