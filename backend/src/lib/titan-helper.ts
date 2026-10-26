import 'dotenv/config'
import express from 'express'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs } from 'node:fs'
import { createHash, timingSafeEqual } from 'node:crypto'

const app = express()

const PORT = Number(process.env.TITAN_HELPER_PORT)
const HOST = process.env.TITAN_HELPER_HOST ?? '0.0.0.0'
const DOCKER = process.env.DOCKER_PATH ?? 'docker'
const NET_IFACE = process.env.TITAN_NET_IFACE ?? 'eth0'

// Every route but /health needs a bearer token. TITAN_HELPER_TOKEN allows
// everything (the production dashboard); TITAN_HELPER_READ_TOKEN, if set,
// allows only GETs (dev), so it can't start or stop containers.
const TOKEN = process.env.TITAN_HELPER_TOKEN ?? ''
const READ_TOKEN = process.env.TITAN_HELPER_READ_TOKEN ?? ''
const MIN_TOKEN_LENGTH = 32

if (TOKEN.length < MIN_TOKEN_LENGTH) {
  console.error(`TITAN_HELPER_TOKEN must be set to at least ${MIN_TOKEN_LENGTH} characters (openssl rand -hex 32)`)
  process.exit(1)
}
if (READ_TOKEN && READ_TOKEN.length < MIN_TOKEN_LENGTH) {
  console.error(`TITAN_HELPER_READ_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters if set`)
  process.exit(1)
}
if (READ_TOKEN && READ_TOKEN === TOKEN) {
  console.error('TITAN_HELPER_READ_TOKEN must differ from TITAN_HELPER_TOKEN')
  process.exit(1)
}

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

function assertContainerName(name: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) {
    throw new Error('Invalid container name')
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runDocker(args: string[], timeout = 15000): Promise<string> {
  const { stdout } = await execFileAsync(DOCKER, args, {
    timeout,
    maxBuffer: 4 * 1024 * 1024,
  })
  return stdout
}

// ── Containers ────────────────────────────────────────────

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

async function inspectContainer(name: string) {
  assertContainerName(name)
  const stdout = await runDocker(['inspect', name])
  const parsed = JSON.parse(stdout)
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`Container not found: ${name}`)
  }
  return parsed[0]
}

// ── System metrics ───────────────────────────────────────

interface ProcStatSample {
  idle:  number
  total: number
}

async function readProcStatSample(): Promise<ProcStatSample> {
  const raw = await fs.readFile('/proc/stat', 'utf8')
  const line = raw.split('\n')[0] ?? ''
  const fields = line.trim().split(/\s+/).slice(1).map(Number)
  const idle = (fields[3] ?? 0) + (fields[4] ?? 0)
  const total = fields.reduce((a, b) => a + b, 0)
  return { idle, total }
}

async function getCpuPct(): Promise<number> {
  const sample1 = await readProcStatSample()
  await sleep(100)
  const sample2 = await readProcStatSample()

  const deltaIdle = sample2.idle - sample1.idle
  const deltaTotal = sample2.total - sample1.total

  if (deltaTotal <= 0) return 0
  return Math.max(0, Math.min(100, (1 - deltaIdle / deltaTotal) * 100))
}

async function getMemInfo(): Promise<{ memTotal: number; memUsed: number }> {
  const raw = await fs.readFile('/proc/meminfo', 'utf8')
  const values: Record<string, number> = {}

  for (const line of raw.split('\n')) {
    const match = line.match(/^(\w+):\s+(\d+)\s*kB$/)
    if (match?.[1] && match[2]) {
      values[match[1]] = Number(match[2]) * 1024
    }
  }

  const memTotal = values.MemTotal ?? 0
  const memAvailable = values.MemAvailable ?? 0
  return { memTotal, memUsed: Math.max(0, memTotal - memAvailable) }
}

async function getDiskUsage() {
  const stdout = await execFileAsync('df', [
    '-B1',
    '-x', 'tmpfs',
    '-x', 'devtmpfs',
    '-x', 'overlay',
    '-x', 'squashfs',
    '--output=target,size,used',
  ]).then(r => r.stdout)

  return stdout
    .split('\n')
    .slice(1)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split(/\s+/)
      const used = Number(parts.pop())
      const total = Number(parts.pop())
      const mount = parts.join(' ')
      return { mount, total, used }
    })
}

async function getNetBytes(iface: string): Promise<{ inBytes: number; outBytes: number }> {
  const raw = await fs.readFile('/proc/net/dev', 'utf8')

  for (const line of raw.split('\n')) {
    const [ifacePart, rest] = line.split(':')
    if (!rest || ifacePart?.trim() !== iface) continue

    const fields = rest.trim().split(/\s+/).map(Number)
    return { inBytes: fields[0] ?? 0, outBytes: fields[8] ?? 0 }
  }

  return { inBytes: 0, outBytes: 0 }
}

async function getUptimeSec(): Promise<number> {
  const raw = await fs.readFile('/proc/uptime', 'utf8')
  return Math.floor(Number(raw.split(/\s+/)[0]) || 0)
}

async function getLoadAvg(): Promise<[number, number, number]> {
  const raw = await fs.readFile('/proc/loadavg', 'utf8')
  const [l1, l5, l15] = raw.split(/\s+/).map(Number)
  return [l1 ?? 0, l5 ?? 0, l15 ?? 0]
}

async function getSystemMetrics() {
  const [cpuPct, mem, disks, net, uptimeSec, loadAvg] = await Promise.all([
    getCpuPct(),
    getMemInfo(),
    getDiskUsage(),
    getNetBytes(NET_IFACE),
    getUptimeSec(),
    getLoadAvg(),
  ])

  return {
    cpuPct,
    memTotal: mem.memTotal,
    memUsed: mem.memUsed,
    disks,
    netInBytes: net.inBytes,
    netOutBytes: net.outBytes,
    uptimeSec,
    loadAvg,
    timestamp: Date.now(),
  }
}

// ── Routes ────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ ok: true })
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

app.post('/containers/:name/start', async (req, res) => {
  try {
    assertContainerName(req.params.name)
    await runDocker(['start', req.params.name])
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Unknown error' })
  }
})

app.post('/containers/:name/stop', async (req, res) => {
  try {
    assertContainerName(req.params.name)
    await runDocker(['stop', req.params.name])
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Unknown error' })
  }
})

app.post('/containers/:name/restart', async (req, res) => {
  try {
    assertContainerName(req.params.name)
    await runDocker(['restart', req.params.name])
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Unknown error' })
  }
})

app.get('/system', async (_req, res) => {
  try {
    res.json(await getSystemMetrics())
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Unknown error' })
  }
})

app.listen(PORT, HOST, () => {
  console.log(`Titan host helper listening on ${HOST}:${PORT}`)
})
