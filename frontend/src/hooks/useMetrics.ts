
import { useQuery } from '@tanstack/react-query'
import type { MetricSummary } from '@shared/types'

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000'

interface MetricsResponse {
  cpu:     MetricSummary
  memory:  MetricSummary
  storage: MetricSummary
  network: MetricSummary
}

export function useMetrics() {
  return useQuery<MetricsResponse>({
    queryKey: ['metrics'],
    queryFn: async () => {
      const res = await fetch(`${API}/api/metrics`)
      if (!res.ok) throw new Error('Failed to fetch metrics')
      return res.json()
    },
    refetchInterval: 10000,
  })
}