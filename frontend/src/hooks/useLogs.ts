import { useQuery } from '@tanstack/react-query'
import type { Host, LogEntry } from '@shared/types'

const API = import.meta.env.VITE_API_URL || '/proxy/4000'

export function useLogs(host: Host) {
  return useQuery<LogEntry[]>({
    queryKey: ['logs', host],
    queryFn: async () => {
      const res = await fetch(`${API}/api/logs?host=${host}`)
      if (!res.ok) throw new Error('Failed to fetch logs')
      return res.json()
    },
    refetchInterval: 15000,
  })
}
