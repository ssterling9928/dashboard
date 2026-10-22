
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import type { Host, MetricSummary } from '@shared/types'

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

// Current + 24h summary of every metric for one host — used by the stat cards.
// Disk uses the backend's default volume per host (/volume1 on Vault, / on Titan).
export function useMetrics(host: Host) {
  return useQuery<MetricsResponse>({
    queryKey: ['metrics', 'summary', host],
    queryFn: async () => {
      const params = `&host=${host}`
      const [cpu, memory, storage, network] = await Promise.all([
        fetchMetric('cpu', params),
        fetchMetric('memory', params),
        fetchMetric('disk', params),
        fetchMetric('network', params),
      ])
      return { cpu, memory, storage, network }
    },
    refetchInterval: 10000,
  })
}

// Single metric over a time range — used by the monitoring charts
export function useMetric(type: string, hours: number, host: Host, extraParams = '') {
  return useQuery<MetricSummary>({
    queryKey: ['metrics', type, hours, host, extraParams],
    queryFn: () => fetchMetric(type, `&range=${hours}&host=${host}${extraParams}`),
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
  })
}
