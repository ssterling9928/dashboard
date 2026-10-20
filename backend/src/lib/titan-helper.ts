import 'dotenv/config'
import express from 'express'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs } from 'node:fs'

const app = express()

const PORT = Number(process.env.TITAN_HELPER_PORT)
const HOST = process.env.TITAN_HELPER_HOST ?? '0.0.0.0'
const DOCKER = process.env.DOCKER_PATH ?? 'docker'
const NET_IFACE = process.env.TITAN_NET_IFACE ?? 'eth0'

const execFileAsync = promisify(execFile)

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

async function getSystemMetrics() {
  const [cpuPct, mem, disks, net] = await Promise.all([
    getCpuPct(),
    getMemInfo(),
    getDiskUsage(),
    getNetBytes(NET_IFACE),
  ])

  return {
    cpuPct,
    memTotal: mem.memTotal,
    memUsed: mem.memUsed,
    disks,
    netInBytes: net.inBytes,
    netOutBytes: net.outBytes,
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
