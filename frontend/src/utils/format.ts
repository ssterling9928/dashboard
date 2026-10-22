import type { HostStatus } from '@shared/types'

// `locales` defaults to the browser's locale; tests pass a fixed one

// Chart axis: "2:35 PM" for short ranges, "2 PM" once the chart spans many hours
export function formatTick(time: string, hours: number, locales: Intl.LocalesArgument = []): string {
  return new Date(time).toLocaleTimeString(locales, hours > 6
    ? { hour: 'numeric' }
    : { hour: 'numeric', minute: '2-digit' })
}

// Chart tooltip: "Tue, Oct 21, 2:35 PM"
export function formatTooltipLabel(time: string, locales: Intl.LocalesArgument = []): string {
  return new Date(time).toLocaleString(locales, {
    weekday: 'short',
    month:   'short',
    day:     'numeric',
    hour:    'numeric',
    minute:  '2-digit',
  })
}

export function formatUptime(seconds: number | null): string {
  if (seconds === null) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function formatLoad(load: [number, number, number] | null): string {
  return load ? load.map(n => n.toFixed(2)).join(', ') : '—'
}

export function formatContainers(containers: HostStatus['containers']): string {
  return containers ? `${containers.running} / ${containers.total} running` : '—'
}
