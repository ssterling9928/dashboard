import 'dotenv/config'
import express from 'express'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs, readFileSync } from 'node:fs'
import { createServer } from 'node:https'
import { createHash, timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import type { Package, PackageDetail } from './../types/types.js'

const app = express()

// Fails closed: the helper won't start without an explicit LAN address,
// a TLS certificate and key, and a token. Requests cross the LAN, so it
// only speaks HTTPS (the dashboard pins this certificate's fingerprint).
const PORT = Number(process.env.SYNO_HELPER_PORT)
const HOST = process.env.SYNO_HELPER_HOST ?? ''
const TLS_CERT = process.env.SYNO_HELPER_TLS_CERT ?? ''
const TLS_KEY = process.env.SYNO_HELPER_TLS_KEY ?? ''
const SYNOPKG = process.env.SYNOPKG_PATH ?? '/usr/syno/bin/synopkg'
// Container Manager's docker CLI. Needs root, like synopkg.
const DOCKER = process.env.DOCKER_PATH ?? '/usr/local/bin/docker'

// Every route but /health needs a bearer token. SYNO_HELPER_TOKEN allows
// everything (the production dashboard); SYNO_HELPER_READ_TOKEN, if set,
// allows only GETs (dev).
const TOKEN = process.env.SYNO_HELPER_TOKEN ?? ''
const READ_TOKEN = process.env.SYNO_HELPER_READ_TOKEN ?? ''
const MIN_TOKEN_LENGTH = 32

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

if (!Number.isInteger(PORT) || PORT <= 0) fail('SYNO_HELPER_PORT must be set')
if (!HOST || HOST === '0.0.0.0' || HOST === '::') {
  fail('SYNO_HELPER_HOST must be the NAS\'s LAN address (e.g. 10.0.0.30), not every interface')
}
if (!TLS_CERT || !TLS_KEY) fail('SYNO_HELPER_TLS_CERT and SYNO_HELPER_TLS_KEY must point to the certificate and key files')
if (TOKEN.length < MIN_TOKEN_LENGTH) {
  fail(`SYNO_HELPER_TOKEN must be set to at least ${MIN_TOKEN_LENGTH} characters (openssl rand -hex 32)`)
}
if (READ_TOKEN && READ_TOKEN.length < MIN_TOKEN_LENGTH) {
  fail(`SYNO_HELPER_READ_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters if set`)
}
if (READ_TOKEN && READ_TOKEN === TOKEN) fail('SYNO_HELPER_READ_TOKEN must differ from SYNO_HELPER_TOKEN')

const execFileAsync = promisify(execFile)

// Compare digests so the comparison takes the same time whatever the input
function tokenMatches(given: string, expected: string): boolean {
  if (!expected) return false
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

app.use((req, res, next) => {
  if (req.path === '/health') return next()

  const header = req.get('authorization') ?? ''
  const given = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''

  if (tokenMatches(given, TOKEN)) return next()
  if (tokenMatches(given, READ_TOKEN)) {
    if (req.method === 'GET') return next()
    return res.status(403).json({ error: 'Read-only token' })
  }
  res.status(401).json({ error: 'Unauthorized' })
})

function assertPkgId(id: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new Error('Invalid package id')
  }
}

function humanizePackageName(id: string): string {
  return id
    .replace(/[._]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\bjs\b/gi, 'JS')
    .replace(/\bv(\d+)\b/gi, 'v$1')
    .trim()
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'N/A'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function getDirSize(dir: string): Promise<number> {
  let total = 0
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    try {
      if (entry.isDirectory()) {
        total += await getDirSize(fullPath)
      } else if (entry.isFile()) {
        total += (await fs.stat(fullPath)).size
      } else if (entry.isSymbolicLink()) {
        const stat = await fs.stat(fullPath).catch(() => null)
        if (stat?.isDirectory()) {
          total += await getDirSize(fullPath)
        } else if (stat?.isFile()) {
          total += stat.size
        }
      }
    } catch {
      // Ignore files we can't stat/read.
    }
  }

  return total
}

async function runSynopkg(args: string[], timeout = 15000): Promise<string> {
  const { stdout } = await execFileAsync(SYNOPKG, args, {
    timeout,
    env: {
      ...process.env,
      LD_LIBRARY_PATH:
        process.env.LD_LIBRARY_PATH ??
        ['/lib', '/usr/lib', '/usr/syno/lib', '/usr/local/lib'].join(':'),
    },
  })

  return stdout
}

function parseSynopkgList(stdout: string): Array<Package & { description: string }> {
  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line): (Package & { description: string }) | null => {
      const colonIndex = line.indexOf(':')
      const left = (colonIndex >= 0 ? line.slice(0, colonIndex) : line).trim()
      const description = (colonIndex >= 0 ? line.slice(colonIndex + 1) : '').trim()

      const match = left.match(/^(.+?)-(\d[\d._-]*)$/)
      if (!match) return null

      const id = match[1]?.trim()
      const version = match[2]?.trim()

      if (!id || !version) return null

      return {
        id,
        name: humanizePackageName(id),
        version,
        type: 'package',
        description,
      }
    })
    .filter((pkg): pkg is Package & { description: string } => pkg !== null)
}

function parseStatus(stdout: string): string {
  const normalized = stdout.trim().toLowerCase()

  if (!normalized) return 'unknown'
  if (normalized.includes('running')) return 'running'
  if (normalized.includes('stopped')) return 'stopped'
  if (normalized.includes('stop')) return 'stopped'
  if (normalized.includes('enabled')) return 'enabled'
  if (normalized.includes('disable')) return 'disabled'

  return stdout.trim()
}

async function readInfoFile(pkgId: string): Promise<Record<string, string>> {
  const infoPath = `/var/packages/${pkgId}/INFO`
  if (!(await exists(infoPath))) return {}

  const raw = await fs.readFile(infoPath, 'utf8')
  const result: Record<string, string> = {}

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const match = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*"(.*)"\s*$/)
    if (match?.[1] && match[2] !== undefined) {
      result[match[1]] = match[2]
      continue
    }

    const simpleMatch = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (simpleMatch?.[1] && simpleMatch[2] !== undefined) {
      result[simpleMatch[1]] = simpleMatch[2].replace(/^"(.*)"$/, '$1')
    }
  }

  return result
}

async function getInstallPath(pkgId: string): Promise<string> {
  const targetPath = `/var/packages/${pkgId}/target`
  const packageRoot = `/var/packages/${pkgId}`

  if (await exists(targetPath)) {
    try {
      const realPath = await fs.realpath(targetPath)
      return realPath
    } catch {
      return targetPath
    }
  }

  return packageRoot
}

async function getPackageSize(pkgId: string): Promise<string> {
  const packageRoot = `/var/packages/${pkgId}`
  if (!(await exists(packageRoot))) return 'N/A'

  const bytes = await getDirSize(packageRoot)
  return formatBytes(bytes)
}

async function getPackageStatus(pkgId: string): Promise<string> {
  try {
    const stdout = await runSynopkg(['status', pkgId], 30000)
    return parseStatus(stdout)
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.message?.includes('aborted')) {
      return 'unknown'
    }
    return 'unknown'
  }
}

// ── Containers ────────────────────────────────────────────
// The same endpoints and allow-listed inspect output as titan-helper.ts.
// Copied rather than shared, since each helper is deployed as a single file.

function assertContainerName(name: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) {
    throw new Error('Invalid container name')
  }
}

async function runDocker(args: string[], timeout = 15000): Promise<string> {
  const { stdout } = await execFileAsync(DOCKER, args, {
    timeout,
    maxBuffer: 4 * 1024 * 1024,
  })
  return stdout
}

interface DockerPsEntry {
  Names:  string
  Image:  string
  Status: string
  State:  string
}

async function listContainers() {
  const stdout = await runDocker(['ps', '-a', '--format', '{{json .}}'])

  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line): DockerPsEntry => JSON.parse(line))
    .map(entry => ({
      name:   entry.Names,
      image:  entry.Image,
      status: entry.Status,
      state:  entry.State,
    }))
}

// Copy only the listed keys (one level) from an object, if present
function pick(source: any, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!source || typeof source !== 'object') return out
  for (const key of keys) {
    if (key in source) out[key] = source[key]
  }
  return out
}

// Allow-list of `docker inspect` fields the dashboard uses. Env values,
// Cmd/Entrypoint/Args, Labels and healthcheck output never leave the NAS:
// any of them can hold secrets, and even the read-only token can call this.
// Env is reduced to variable names.
function safeInspect(raw: any) {
  const env: unknown[] = Array.isArray(raw?.Config?.Env) ? raw.Config.Env : []

  return {
    ...pick(raw, ['Id', 'Name', 'Created', 'Image', 'RestartCount']),
    State: {
      ...pick(raw?.State, ['Status', 'Running', 'Paused', 'Restarting', 'OOMKilled', 'ExitCode', 'StartedAt', 'FinishedAt']),
      ...(raw?.State?.Health ? { Health: pick(raw.State.Health, ['Status']) } : {}),
    },
    Config: {
      ...pick(raw?.Config, ['Image', 'User', 'WorkingDir', 'ExposedPorts']),
      Env: env.filter((e): e is string => typeof e === 'string').map(e => e.split('=')[0]),
    },
    HostConfig: pick(raw?.HostConfig, ['RestartPolicy', 'NetworkMode', 'Privileged', 'ReadonlyRootfs', 'CapAdd', 'PortBindings']),
    Mounts: (Array.isArray(raw?.Mounts) ? raw.Mounts : [])
      .map((m: any) => pick(m, ['Type', 'Source', 'Destination', 'Mode', 'RW'])),
    NetworkSettings: {
      ...pick(raw?.NetworkSettings, ['Ports']),
      Networks: Object.fromEntries(
        Object.entries(raw?.NetworkSettings?.Networks ?? {})
          .map(([net, cfg]) => [net, pick(cfg, ['IPAddress', 'Gateway', 'MacAddress', 'Aliases'])])
      ),
    },
  }
}

async function inspectContainer(name: string) {
  assertContainerName(name)
  const stdout = await runDocker(['inspect', name])
  const parsed = JSON.parse(stdout)
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`Container not found: ${name}`)
  }
  return safeInspect(parsed[0])
}

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/packages', async (_req, res) => {
  try {
    const stdout = await runSynopkg(['list'])
    const parsed = parseSynopkgList(stdout)

    const packages: Package[] = await Promise.all(
      parsed.map(async pkg => {
        const info = await readInfoFile(pkg.id)

        return {
          id: info.package || pkg.id,
          name: info.displayname || humanizePackageName(info.package || pkg.id),
          version: info.version || pkg.version,
          type: 'package',
        }
      })
    )

    packages.sort((a, b) => a.name.localeCompare(b.name))
    res.json(packages)
  } catch (err: any) {
    res.status(500).json({
      error: err?.message ?? 'Unknown error',
    })
  }
})

app.get('/packages/:id', async (req, res) => {
  try {
    const pkgId = req.params.id
    assertPkgId(pkgId)

    const info = await readInfoFile(pkgId)

    if (pkgId === 'ContainerManager') {
      return res.json({
        id: info.package || pkgId,
        name: info.displayname || humanizePackageName(info.package || pkgId),
        version: info.version || '',
        description:
          info.description ||
          'Container Manager package details are handled separately by the dashboard.',
        status: 'running',
        installPath: '/var/packages/ContainerManager/target',
        size: 'N/A',
        type: 'package',
      })
    }

    const installPath = await getInstallPath(pkgId)
    const size = await getPackageSize(pkgId)
    const status = await getPackageStatus(pkgId)

    const packageDetail: PackageDetail = {
      id: info.package || pkgId,
      name: info.displayname || humanizePackageName(info.package || pkgId),
      version: info.version || '',
      description: info.description || '',
      status,
      installPath,
      size,
      type: 'package',
    }

    res.json(packageDetail)
  } catch (err: any) {
    res.status(500).json({
      error: err?.message ?? 'Unknown error',
    })
  }
})

app.get('/containers', async (_req, res) => {
  try {
    res.json(await listContainers())
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Unknown error' })
  }
})

app.get('/containers/:name', async (req, res) => {
  try {
    res.json(await inspectContainer(req.params.name))
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Unknown error' })
  }
})

for (const action of ['start', 'stop', 'restart'] as const) {
  app.post(`/containers/:name/${action}`, async (req, res) => {
    try {
      assertContainerName(req.params.name)
      await runDocker([action, req.params.name], 60000)
      res.json({ ok: true })
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Unknown error' })
    }
  })
}

const server = createServer(
  { cert: readFileSync(TLS_CERT), key: readFileSync(TLS_KEY), minVersion: 'TLSv1.3' },
  app,
)

server.listen(PORT, HOST, () => {
  console.log(`Synology host helper listening on https://${HOST}:${PORT}`)
})