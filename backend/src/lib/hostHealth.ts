// Per-host state recorded by the metrics poller (routes/metrics.ts)
// and turned into status and alerts (lib/alerts.ts)

export interface HostSnapshot {
  online:     boolean
  error:      string | null    // last poll error; null before the first poll
  lastPolled: string | null
  model:      string | null
  uptimeSec:  number | null
  loadAvg:    [number, number, number] | null
}

export interface VaultHealth {
  systemStatus: number
  temperature:  number
  powerStatus:  number
  systemFan:    number
  cpuFan:       number
  disks: { name: string; status: number; health: number; temperature: number }[]
  raids: { name: string; status: number }[]
}
