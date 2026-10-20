import { getJson, postJson } from './http.js'

const TITAN_HELPER_URL =
  process.env.TITAN_HELPER_URL?.replace(/\/+$/, '') ?? 'http://YOUR_TITAN_IP:4222'

export interface TitanContainerSummary {
  name:   string
  image:  string
  status: string
  state:  string
}

// Raw `docker inspect` output shape (only the fields we actually read)
export interface TitanContainerInspect {
  Id:      string
  Image:   string
  Name:    string
  State: {
    Status:     string
    StartedAt:  string
  }
  Config: {
    Image: string
  }
  HostConfig: {
    RestartPolicy?: { Name: string }
  }
  NetworkSettings: {
    Networks: Record<string, unknown>
    Ports?:   Record<string, Array<{ HostPort: string }> | null>
  }
  RestartCount: number
}

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
  timestamp:   number
}

export async function getTitanContainers(): Promise<TitanContainerSummary[]> {
  return getJson<TitanContainerSummary[]>(`${TITAN_HELPER_URL}/containers`)
}

export async function getTitanContainer(name: string): Promise<TitanContainerInspect> {
  return getJson<TitanContainerInspect>(`${TITAN_HELPER_URL}/containers/${encodeURIComponent(name)}`)
}

export async function titanContainerAction(
  name: string,
  action: 'start' | 'stop' | 'restart'
): Promise<void> {
  await postJson(`${TITAN_HELPER_URL}/containers/${encodeURIComponent(name)}/${action}`)
}

export async function getTitanSystemMetrics(): Promise<TitanSystemMetrics> {
  return getJson<TitanSystemMetrics>(`${TITAN_HELPER_URL}/system`)
}
