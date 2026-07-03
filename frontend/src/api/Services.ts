
const API = import.meta.env.VITE_API_URL || '/proxy/4000'
const BASE = `${API}/api/services`

export async function fetchServices() {
  const res = await fetch(BASE)
  if (!res.ok) throw new Error('Failed to fetch services')
  return res.json()
}

export async function fetchService(id: string) {
  const res = await fetch(`${BASE}/${id}`)
  if (!res.ok) throw new Error('Failed to fetch service')
  return res.json()
}

export async function containerAction(id: string, action: 'start' | 'stop' | 'restart') {
  const res = await fetch(`${BASE}/${id}/${action}`, { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to ${action} container`)
  return res.json()
}