import { useQuery } from '@tanstack/react-query'
import type { Host, LogEntry } from '@shared/types'
import { API } from '../config/api'

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
