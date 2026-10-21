
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import type { MetricSummary } from '@shared/types'

const API = import.meta.env.VITE_API_URL || '/proxy/4000'

interface MetricsResponse {
  cpu:     MetricSummary
  memory:  MetricSummary
  storage: MetricSummary
  network: MetricSummary
}

async function fetchMetric(type: string, extraParams = ''): Promise<MetricSummary> {
  const res = await fetch(`${API}/api/metrics?type=${type}${extraParams}`)
  if (!res.ok) throw new Error(`Failed to fetch ${type} metrics`)
  return res.json()
}

export function useMetrics() {
  return useQuery<MetricsResponse>({
    queryKey: ['metrics'],
    queryFn: async () => {
      const [cpu, memory, storage, network] = await Promise.all([
        fetchMetric('cpu'),
        fetchMetric('memory'),
        fetchMetric('disk', '&volume=volume1'),
        fetchMetric('network'),
      ])
      return { cpu, memory, storage, network }
    },
    refetchInterval: 10000,
  })
}

// Single metric over a time range — used by the monitoring charts
export function useMetric(type: string, hours: number, extraParams = '') {
  return useQuery<MetricSummary>({
    queryKey: ['metrics', type, hours, extraParams],
    queryFn: () => fetchMetric(type, `&range=${hours}${extraParams}`),
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
  })
}
