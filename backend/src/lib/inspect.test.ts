import { describe, expect, it } from 'vitest'
import { sanitizeInspect } from './inspect.js'

const SECRET = 'hunter2-s3cr3t'

// Trimmed real-world `docker inspect` shape with secrets planted in every
// field that commonly carries them
const raw = {
  Id: 'abc123',
  Name: '/grafana',
  Created: '2026-10-01T00:00:00Z',
  Image: 'sha256:deadbeef',
  Path: '/run.sh',
  Args: [`--password=${SECRET}`],
  RestartCount: 2,
  State: {
    Status: 'running', Running: true, Paused: false, Restarting: false,
    OOMKilled: false, ExitCode: 0,
    StartedAt: '2026-10-25T10:00:00Z', FinishedAt: '0001-01-01T00:00:00Z',
    Health: { Status: 'healthy', Log: [{ Output: `token=${SECRET}` }] },
  },
  Config: {
    Image: 'grafana/grafana:11.0.0',
    User: '472',
    WorkingDir: '/usr/share/grafana',
    Env: [`GF_SECURITY_ADMIN_PASSWORD=${SECRET}`, 'PATH=/usr/bin', 'EMPTY=', 'NOEQUALS'],
    Cmd: [`--secret=${SECRET}`],
    Entrypoint: ['/run.sh'],
    Labels: { 'traefik.http.middlewares.auth.basicauth.users': `admin:${SECRET}` },
    Healthcheck: { Test: ['CMD', 'curl', `http://admin:${SECRET}@localhost`] },
    ExposedPorts: { '3000/tcp': {} },
  },
  HostConfig: {
    RestartPolicy: { Name: 'unless-stopped' },
    NetworkMode: 'private',
    Privileged: false,
    ReadonlyRootfs: false,
    CapAdd: ['NET_ADMIN'],
    PortBindings: { '3000/tcp': [{ HostIp: '', HostPort: '3000' }] },
    Binds: [`/opt/docker/data/grafana:/var/lib/grafana`],
  },
  Mounts: [{ Type: 'bind', Source: '/opt/docker/data/grafana', Destination: '/var/lib/grafana', Mode: 'rw', RW: true, Propagation: 'rprivate' }],
  NetworkSettings: {
    Networks: { private: { IPAddress: '172.18.0.7', Gateway: '172.18.0.1', MacAddress: '02:42:ac:12:00:07', Aliases: ['grafana'], DriverOpts: null } },
  },
}

describe('sanitizeInspect', () => {
  it('never returns a planted secret from any field', () => {
    expect(JSON.stringify(sanitizeInspect(raw))).not.toContain(SECRET)
  })

  it('keeps env variable names but not their values', () => {
    expect(sanitizeInspect(raw).Config.EnvNames).toEqual([
      'EMPTY', 'GF_SECURITY_ADMIN_PASSWORD', 'NOEQUALS', 'PATH',
    ])
  })

  it('drops command line, labels and healthcheck details entirely', () => {
    const out = sanitizeInspect(raw) as unknown as Record<string, any>
    expect(out.Args).toBeUndefined()
    expect(out.Path).toBeUndefined()
    expect(out.Config.Cmd).toBeUndefined()
    expect(out.Config.Entrypoint).toBeUndefined()
    expect(out.Config.Labels).toBeUndefined()
    expect(out.Config.Healthcheck).toBeUndefined()
    expect(out.State.Health).toBe('healthy')
  })

  it('keeps the useful, non-secret fields', () => {
    const out = sanitizeInspect(raw)
    expect(out).toMatchObject({
      Id: 'abc123',
      Name: 'grafana',
      RestartCount: 2,
      Config: { Image: 'grafana/grafana:11.0.0', User: '472', ExposedPorts: ['3000/tcp'] },
      State: { Status: 'running', Running: true, ExitCode: 0 },
      HostConfig: {
        RestartPolicy: 'unless-stopped',
        NetworkMode: 'private',
        CapAdd: ['NET_ADMIN'],
        PortBindings: { '3000/tcp': [{ HostIp: '', HostPort: '3000' }] },
      },
      Mounts: [{ Type: 'bind', Source: '/opt/docker/data/grafana', Destination: '/var/lib/grafana', Mode: 'rw', RW: true }],
      Networks: { private: { IPAddress: '172.18.0.7', Aliases: ['grafana'] } },
    })
    expect(out.Mounts[0]).not.toHaveProperty('Propagation')
    expect(out.Networks.private).not.toHaveProperty('DriverOpts')
  })

  it('copes with missing or malformed input', () => {
    for (const input of [null, undefined, 'nope', 42, [], {}, { Config: 'x', Mounts: 'y', NetworkSettings: { Networks: [] } }]) {
      const out = sanitizeInspect(input)
      expect(out.Id).toBeNull()
      expect(out.Config.EnvNames).toEqual([])
      expect(out.Mounts).toEqual([])
      expect(out.Networks).toEqual({})
    }
  })
})
