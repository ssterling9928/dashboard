// Safe subset of `docker inspect` for the dashboard's Inspect view.
//
// This is an allow-list: only the fields below are ever returned. Env
// values, Cmd/Entrypoint/Args, Labels and healthcheck output are left out
// because any of them can carry secrets (passwords, API keys, auth hashes).
// Env variable *names* are kept so you can still see what's configured.

type Raw = Record<string, any>

export interface SafeInspect {
  Id:           string | null
  Name:         string | null
  Created:      string | null
  Image:        string | null
  RestartCount: number | null
  Config: {
    Image:        string | null
    User:         string | null
    WorkingDir:   string | null
    ExposedPorts: string[]
    EnvNames:     string[]
  }
  State: {
    Status:     string | null
    Running:    boolean | null
    Paused:     boolean | null
    Restarting: boolean | null
    OOMKilled:  boolean | null
    ExitCode:   number | null
    StartedAt:  string | null
    FinishedAt: string | null
    Health:     string | null
  }
  HostConfig: {
    RestartPolicy:  string | null
    NetworkMode:    string | null
    Privileged:     boolean | null
    ReadonlyRootfs: boolean | null
    CapAdd:         string[]
    PortBindings:   Record<string, Array<{ HostIp: string | null; HostPort: string | null }>>
  }
  Mounts: Array<{
    Type:        string | null
    Source:      string | null
    Destination: string | null
    Mode:        string | null
    RW:          boolean | null
  }>
  Networks: Record<string, {
    IPAddress:  string | null
    Gateway:    string | null
    MacAddress: string | null
    Aliases:    string[]
  }>
}

const str  = (v: unknown): string | null  => (typeof v === 'string' ? v : null)
const num  = (v: unknown): number | null  => (typeof v === 'number' ? v : null)
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? v as Raw : {})

// "KEY=value" → "KEY"; the value is never read
function envName(entry: string): string {
  const i = entry.indexOf('=')
  return i === -1 ? entry : entry.slice(0, i)
}

export function sanitizeInspect(raw: unknown): SafeInspect {
  const r          = obj(raw)
  const config     = obj(r.Config)
  const state      = obj(r.State)
  const hostConfig = obj(r.HostConfig)
  const networks   = obj(obj(r.NetworkSettings).Networks)

  const portBindings: SafeInspect['HostConfig']['PortBindings'] = {}
  for (const [port, bindings] of Object.entries(obj(hostConfig.PortBindings))) {
    portBindings[port] = Array.isArray(bindings)
      ? bindings.map(b => ({ HostIp: str(obj(b).HostIp), HostPort: str(obj(b).HostPort) }))
      : []
  }

  const safeNetworks: SafeInspect['Networks'] = {}
  for (const [name, net] of Object.entries(networks)) {
    const n = obj(net)
    safeNetworks[name] = {
      IPAddress:  str(n.IPAddress),
      Gateway:    str(n.Gateway),
      MacAddress: str(n.MacAddress),
      Aliases:    strList(n.Aliases),
    }
  }

  return {
    Id:           str(r.Id),
    Name:         str(r.Name)?.replace(/^\//, '') ?? null,
    Created:      str(r.Created),
    Image:        str(r.Image),
    RestartCount: num(r.RestartCount),
    Config: {
      Image:        str(config.Image),
      User:         str(config.User),
      WorkingDir:   str(config.WorkingDir),
      ExposedPorts: Object.keys(obj(config.ExposedPorts)),
      EnvNames:     strList(config.Env).map(envName).sort(),
    },
    State: {
      Status:     str(state.Status),
      Running:    bool(state.Running),
      Paused:     bool(state.Paused),
      Restarting: bool(state.Restarting),
      OOMKilled:  bool(state.OOMKilled),
      ExitCode:   num(state.ExitCode),
      StartedAt:  str(state.StartedAt),
      FinishedAt: str(state.FinishedAt),
      Health:     str(obj(state.Health).Status),
    },
    HostConfig: {
      RestartPolicy:  str(obj(hostConfig.RestartPolicy).Name),
      NetworkMode:    str(hostConfig.NetworkMode),
      Privileged:     bool(hostConfig.Privileged),
      ReadonlyRootfs: bool(hostConfig.ReadonlyRootfs),
      CapAdd:         strList(hostConfig.CapAdd),
      PortBindings:   portBindings,
    },
    Mounts: (Array.isArray(r.Mounts) ? r.Mounts : []).map((m: unknown) => {
      const mount = obj(m)
      return {
        Type:        str(mount.Type),
        Source:      str(mount.Source),
        Destination: str(mount.Destination),
        Mode:        str(mount.Mode),
        RW:          bool(mount.RW),
      }
    }),
    Networks: safeNetworks,
  }
}
