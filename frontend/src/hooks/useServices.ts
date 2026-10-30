
import { useQuery } from '@tanstack/react-query'
import type { Service, ServiceDetail } from '@shared/types'
import { API } from '../config/api'

export function useServices() {
  return useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: async () => {
      const res = await fetch(`${API}/api/services`)
      if (!res.ok) throw new Error('Failed to fetch services')
      return res.json()
    },
  })
}

export function useServiceDetail(id: string | null) {
  return useQuery<ServiceDetail>({
    queryKey: ['services', id],
    queryFn: async () => {
      const res = await fetch(`${API}/api/services/${id}`)
      if (!res.ok) throw new Error('Failed to fetch service detail')
      return res.json()
    },
    enabled: !!id,
  })
}

export async function containerAction(id: string, action: 'start' | 'stop' | 'restart') {
  // The backend refuses state-changing requests without this header (CSRF):
  // a cross-site page can't add it, because the API offers no CORS
  const res = await fetch(`${API}/api/services/${id}/${action}`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'homelab-dashboard' },
  })
  if (!res.ok) throw new Error(`Failed to ${action} container`)
  return res.json()
}