
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
import { formatTick, formatTooltipLabel } from '../utils/format'
import { useTheme } from '../hooks/useTheme'

interface Props {
  data: MetricSummary
}

// Recharts takes colors as props, so the dark: variant can't reach them
const COLORS = {
  light: { grid: '#f0f0f0', tick: '#9ca3af', label: '#6b7280', border: '#e5e7eb', bg: '#ffffff', line: '#4f46e5' },
  dark:  { grid: '#1f2937', tick: '#6b7280', label: '#9ca3af', border: '#374151', bg: '#111827', line: '#818cf8' },
}

export default function MetricChart({ data }: Props) {
  const isPercent = data.unit === '%'
  const [theme] = useTheme()
  const c = COLORS[theme]

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart
        data={data.history}
        margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
        <XAxis
          dataKey="time"
          tickFormatter={(t) => formatTick(t)}
          minTickGap={40}
          tick={{ fontSize: 11, fill: c.tick }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={isPercent ? [0, 100] : ['auto', 'auto']}
          tick={{ fontSize: 11, fill: c.tick }}
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
          labelStyle={{ color: c.label, fontSize: 11 }}
          contentStyle={{
            border: `1px solid ${c.border}`,
            backgroundColor: c.bg,
            borderRadius: '8px',
            fontSize: 12,
          }}
        />
        <Line
          type="linear"
          dataKey="value"
          stroke={c.line}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: c.line }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}