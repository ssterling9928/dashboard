
export interface Service {
  id: string
  name: string
  status: 'running' | 'stopped' | 'paused' | 'unknown'
  health: 'healthy' | 'unhealthy' | 'unknown'
  image: string
  uptime: string
  restarts: number
  containerName: string
  containerId: string
}

export interface ServiceDetail extends Service {
  // Network
  publicHostname?: string
  internalIp?: string
  ports: string[]
  url?: string
  // Runtime
  started: string
  restartPolicy: string
  // Version/description
  version?: string
  description?: string
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