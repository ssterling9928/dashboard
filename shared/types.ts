
export type Host = 'synology' | 'titan'

// ── Docker Container ──────────────────────────────────────
export interface Service {
  ServiceId:   string
  Name:        string
  Version:     string
  Status:      string
  Uptime:      string
  Type:        'container'
  Host:        Host
}

export interface ServiceDetail extends Service {
  ImageId:       string
  ContainerId:   string
  RestartPolicy: string
  Ports:         string[]
  Started:       string
  Restarts:      number
  Url:           string | null   // null when the container has no web app
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
  volume?: string   // disk metrics only
}

export interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warning' | 'error'
  source: string
  message: string
}

// ── System Status / Alerts ────────────────────────────────
export interface HostStatus {
  host:        Host
  label:       string
  online:      boolean
  model:       string | null
  uptimeSec:   number | null
  loadAvg:     [number, number, number] | null
  containers:  { running: number; total: number } | null
  lastPolled:  string | null
}

export type AlertSeverity = 'critical' | 'warning'

export interface Alert {
  id:        string
  severity:  AlertSeverity
  host:      Host
  title:     string
  detail:    string
}

export interface SystemStatus {
  overall:  'ok' | 'warning' | 'critical'
  hosts:    HostStatus[]
  alerts:   Alert[]
}

export type SynoParams = Record<string, string | number | boolean | string[]>