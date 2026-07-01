
import { useQuery } from '@tanstack/react-query'
import type { LogEntry } from '@shared/types'

const API = import.meta.env.VITE_API_URL || '/proxy/4000'

export function useLogs() {
  return useQuery<LogEntry[]>({
    queryKey: ['logs'],
    queryFn: async () => {
      const res = await fetch(`${API}/api/logs`)
      if (!res.ok) throw new Error('Failed to fetch logs')
      return res.json()
    },
    refetchInterval: 15000,
  })
}