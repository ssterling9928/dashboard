import { describe, expect, it } from 'vitest'
import {
  buildServiceUrl,
  formatTimestamp,
  formatUptime,
  mapTitanPorts,
  parseDockerPsUptime,
  parseLevel,
  parseStatus,
  splitServiceId,
} from './parsers.js'

describe('parseStatus', () => {
  it('normalizes known Docker states case-insensitively', () => {
    expect(parseStatus('running')).toBe('running')
    expect(parseStatus('Exited')).toBe('exited')
    expect(parseStatus('STOPPED')).toBe('stopped')
    expect(parseStatus('paused')).toBe('paused')
  })

  it('maps anything else to unknown', () => {
    expect(parseStatus('restarting')).toBe('unknown')
    expect(parseStatus('')).toBe('unknown')
  })
})

describe('formatUptime', () => {
  const NOW = Date.UTC(2026, 9, 22, 12, 0, 0)
  const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString()

  it('formats seconds, minutes, hours and days', () => {
    expect(formatUptime(ago(45), NOW)).toBe('45s')
    expect(formatUptime(ago(5 * 60), NOW)).toBe('5m')
    expect(formatUptime(ago(2 * 3600 + 3 * 60), NOW)).toBe('2h 3m')
    expect(formatUptime(ago(3 * 86400 + 4 * 3600 + 5 * 60), NOW)).toBe('3d 4h 5m')
  })

  it('returns N/A for a container that never started', () => {
    expect(formatUptime('0001-01-01T00:00:00Z', NOW)).toBe('N/A')
    expect(formatUptime('', NOW)).toBe('N/A')
  })
})

describe('parseDockerPsUptime', () => {
  it('extracts the duration from "Up …" and ignores other states', () => {
    expect(parseDockerPsUptime('Up 3 days')).toBe('3 days')
    expect(parseDockerPsUptime('Up 2 hours (healthy)')).toBe('2 hours (healthy)')
    expect(parseDockerPsUptime('Exited (0) 2 hours ago')).toBe('N/A')
  })
})

describe('mapTitanPorts', () => {
  it('formats host:container/protocol for every binding', () => {
    expect(mapTitanPorts({
      '80/tcp':   [{ HostPort: '8080' }, { HostPort: '8081' }],
      '53/udp':   [{ HostPort: '53' }],
      '9000/tcp': null,                   // exposed but not published
    })).toEqual(['8080:80/tcp', '8081:80/tcp', '53:53/udp'])
  })

  it('handles containers with no port data', () => {
    expect(mapTitanPorts(undefined)).toEqual([])
    expect(mapTitanPorts({})).toEqual([])
  })
})

describe('splitServiceId', () => {
  it('splits on the first colon only', () => {
    expect(splitServiceId('titan:grafana')).toEqual({ host: 'titan', name: 'grafana' })
    expect(splitServiceId('synology:a:b')).toEqual({ host: 'synology', name: 'a:b' })
  })

  it('rejects ids without a host or with an unknown host', () => {
    expect(() => splitServiceId('grafana')).toThrow('Invalid service id')
    expect(() => splitServiceId('atlas:grafana')).toThrow('Unknown host')
  })
})

describe('buildServiceUrl', () => {
  it('uses the {name}.home pattern', () => {
    expect(buildServiceUrl('grafana')).toBe('https://grafana.home.sterling-dev.com')
  })
})

describe('parseLevel', () => {
  it('maps syslog and Loki levels to error / warning / info', () => {
    for (const level of ['err', 'error', 'CRIT', 'critical', 'alert', 'emerg', 'emergency']) {
      expect(parseLevel(level)).toBe('error')
    }
    expect(parseLevel('warn')).toBe('warning')
    expect(parseLevel('Warning')).toBe('warning')
    expect(parseLevel('info')).toBe('info')
    expect(parseLevel('debug')).toBe('info')
    expect(parseLevel(undefined)).toBe('info')
  })
})

describe('formatTimestamp', () => {
  // vitest.config.ts pins TZ=America/Chicago (CDT is UTC-5 in October)
  it('formats as "YYYY-MM-DD HH:MM:SS" in local time, like DSM', () => {
    expect(formatTimestamp(Date.UTC(2026, 9, 22, 17, 45, 55))).toBe('2026-10-22 12:45:55')
  })
})
