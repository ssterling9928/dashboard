
import { useQuery } from '@tanstack/react-query'
import type { Package, PackageDetail } from '@shared/types'

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export function usePackages() {
  return useQuery<Package[]>({
    queryKey: ['packages'],
    queryFn: async () => {
      const res = await fetch(`${API}/api/packages`)
      if (!res.ok) throw new Error('Failed to fetch packages')
      return res.json()
    },
  })
}

export function usePackageDetail(id: string | null) {
  return useQuery<PackageDetail>({
    queryKey: ['packages', id],
    queryFn: async () => {
      const res = await fetch(`${API}/api/packages/${id}`)
      if (!res.ok) throw new Error('Failed to fetch package detail')
      return res.json()
    },
    enabled: !!id,
  })
}