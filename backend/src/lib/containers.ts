import {
  buildServiceUrl,
  formatUptime,
  mapTitanPorts,
  parseDockerPsUptime,
  parseStatus,
} from './parsers.js'
import type { Host, Service, ServiceDetail } from '../types/types.js'

// Both host helpers (titan-helper.ts and host-helper.ts on Vault) wrap the
// docker CLI and return the same shapes, so both hosts map the same way.

// One `docker ps -a` row
export interface ContainerSummary {
  name:   string
  image:  string
  status: string
  state:  string
}

// The helpers' allow-listed `docker inspect` output (only the fields read here)
export interface ContainerInspect {
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

export function toService(host: Host, c: ContainerSummary): Service {
  return {
    ServiceId:   `${host}:${c.name}`,
    Name:        c.name,
    Version:     c.image?.split(':')[1] ?? 'unknown',
    Status:      parseStatus(c.state),
    Uptime:      parseDockerPsUptime(c.status),
    Type:        'container',
    Host:        host,
  }
}

export function toServiceDetail(host: Host, inspect: ContainerInspect, name: string): ServiceDetail {
  const containerName = inspect.Name?.replace(/^\//, '') ?? name

  const startedInfo = inspect.State?.StartedAt ?? ''
  const formattedStart = startedInfo && !startedInfo.startsWith('0001')
    ? new Date(startedInfo).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).replace(',', '')
    : 'N/A'

  return {
    ServiceId:        `${host}:${containerName}`,
    Name:             containerName,
    Version:          inspect.Config?.Image?.split(':')[1] ?? 'latest',
    Status:           parseStatus(inspect.State?.Status ?? ''),
    Uptime:           formatUptime(inspect.State?.StartedAt ?? ''),
    Type:             'container',
    Host:             host,

    ImageId:          inspect.Image,
    ContainerId:      inspect.Id,
    RestartPolicy:    inspect.HostConfig?.RestartPolicy?.Name ?? 'none',
    Ports:            mapTitanPorts(inspect.NetworkSettings?.Ports),
    Url:              buildServiceUrl(containerName),
    Started:          formattedStart,
    Restarts:         inspect.RestartCount,
    Networks:         Object.keys(inspect.NetworkSettings?.Networks ?? {})
  }
}
