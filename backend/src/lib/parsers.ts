import { APP_DOMAIN, APP_SUBDOMAINS } from '../config/appLinks.js'
import type { Host, LogEntry } from '../types/types.js'

// ── Containers ────────────────────────────────────────────

// URL of the container's web app, or null if it doesn't have one (see config/appLinks.ts)
export function buildServiceUrl(name: string): string | null {
  const subdomain = Object.hasOwn(APP_SUBDOMAINS, name) ? APP_SUBDOMAINS[name] : undefined
  return subdomain ? `https://${subdomain}.${APP_DOMAIN}` : null
}

export function parseStatus(state: string): string {
  switch (state?.toLowerCase()) {
    case 'running': return 'running'
    case 'exited':  return 'exited'
    case 'stopped': return 'stopped'
    case 'paused':  return 'paused'
    default:        return 'unknown'
  }
}

export function formatUptime(startedAt: string, now = Date.now()): string {
  if (!startedAt || startedAt.startsWith('0001')) return 'N/A'
  const seconds = Math.floor((now - new Date(startedAt).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s`
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

// docker ps "Status" text looks like "Up 3 days" / "Exited (0) 2 hours ago"
export function parseDockerPsUptime(status: string): string {
  return status?.startsWith('Up ') ? status.slice(3) : 'N/A'
}

export function mapTitanPorts(ports: Record<string, Array<{ HostPort: string }> | null> | undefined): string[] {
  if (!ports) return []

  const mapped: string[] = []
  for (const [containerPort, bindings] of Object.entries(ports)) {
    if (!bindings) continue
    const [portNum, type = 'tcp'] = containerPort.split('/')
    for (const binding of bindings) {
      mapped.push(`${binding.HostPort}:${portNum}/${type}`)
    }
  }
  return mapped
}

export function splitServiceId(id: string): { host: Host; name: string } {
  const separatorIndex = id.indexOf(':')
  if (separatorIndex === -1) {
    throw new Error(`Invalid service id: ${id}`)
  }

  const host = id.slice(0, separatorIndex) as Host
  const name = id.slice(separatorIndex + 1)

  if (host !== 'synology' && host !== 'titan') {
    throw new Error(`Unknown host in service id: ${id}`)
  }

  return { host, name }
}

// ── Logs ──────────────────────────────────────────────────

export function parseLevel(prio?: string): LogEntry['level'] {
  switch ((prio ?? '').toLowerCase()) {
    case 'err':
    case 'error':
    case 'crit':
    case 'critical':
    case 'alert':
    case 'emerg':
    case 'emergency':
      return 'error'
    case 'warn':
    case 'warning':
      return 'warning'
    default:
      return 'info'
  }
}

// "2026-10-22 12:45:55" in the server's local time — matches DSM's log format
export function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString('sv-SE').replace('T', ' ')
}
