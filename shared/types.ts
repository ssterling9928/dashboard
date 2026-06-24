
// ── Docker Container ──────────────────────────────────────
export interface Service {
  ServiceId:   string
  Name:        string
  Version:     string
  Status:      string
  Uptime:      string
  Type:        'container'
}

export interface ServiceDetail extends Service {
  ImageId:       string
  ContainerId:   string
  RestartPolicy: string
  Ports:         string[]
  Started:       string
  Restarts:      string
  PublicUrl:     string
  InternalUrl:   string
  Networks:      string[]
}

// ── Synology Package ──────────────────────────────────────
export interface Package {
  id:          string
  name:        string
  version:     string
  type:        'package'
}

export interface PackageDetail extends Package {
  installPath: string
  size:        string
  description: string 
  status:      string 
}



export interface MetricPoint {
  time: string   // "00:00", "06:00" etc
  value: number  // percentage or bytes
}

export interface MetricSummary {
  current: number
  average: number
  peak: number
  unit: string
  history: MetricPoint[]
}

export interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warning' | 'error'
  source: string
  message: string
}

export type SynoParams = Record<string, string | number | boolean | string[]>