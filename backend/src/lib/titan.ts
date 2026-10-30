import { getJson, postJson } from './http.js'
import type { ContainerInspect, ContainerSummary } from './containers.js'

const TITAN_HELPER_URL =
  process.env.TITAN_HELPER_URL?.replace(/\/+$/, '') ?? 'http://YOUR_TITAN_IP:4222'

// Full-access token in production; dev uses the helper's read-only token,
// so start/stop/restart return 403 there
const AUTH = { Authorization: `Bearer ${process.env.TITAN_HELPER_TOKEN ?? ''}` }

export interface TitanDiskUsage {
  mount: string
  total: number
  used:  number
}

export interface TitanSystemMetrics {
  cpuPct:      number
  memTotal:    number
  memUsed:     number
  disks:       TitanDiskUsage[]
  netInBytes:  number
  netOutBytes: number
  // Added after the first helper deploy — absent until titan's copy is updated
  uptimeSec?:  number
  loadAvg?:    [number, number, number]
  timestamp:   number
}

export async function getTitanContainers(): Promise<ContainerSummary[]> {
  return getJson<ContainerSummary[]>(`${TITAN_HELPER_URL}/containers`, undefined, AUTH)
}

export async function getTitanContainer(name: string): Promise<ContainerInspect> {
  return getJson<ContainerInspect>(`${TITAN_HELPER_URL}/containers/${encodeURIComponent(name)}`, undefined, AUTH)
}

export async function titanContainerAction(
  name: string,
  action: 'start' | 'stop' | 'restart'
): Promise<void> {
  await postJson(`${TITAN_HELPER_URL}/containers/${encodeURIComponent(name)}/${action}`, undefined, AUTH)
}

export async function getTitanSystemMetrics(): Promise<TitanSystemMetrics> {
  return getJson<TitanSystemMetrics>(`${TITAN_HELPER_URL}/system`, undefined, AUTH)
}
