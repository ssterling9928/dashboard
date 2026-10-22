import { useQuery } from '@tanstack/react-query'
import type { SystemStatus } from '@shared/types'

const API = import.meta.env.VITE_API_URL || '/proxy/4000'

export function useStatus() {
  return useQuery<SystemStatus>({
    queryKey: ['status'],
    queryFn: async () => {
      const res = await fetch(`${API}/api/status`)
      if (!res.ok) throw new Error('Failed to fetch system status')
      return res.json()
    },
    refetchInterval: 30000,
  })
}
