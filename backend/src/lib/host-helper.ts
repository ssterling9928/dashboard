import 'dotenv/config'
import express from 'express'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Package, PackageDetail } from './../types/types.js'

const app = express()

const PORT = Number(process.env.SYNO_HELPER_PORT)
const HOST = process.env.SYNO_HELPER_HOST ?? "0.0.0.0"
const SYNOPKG = process.env.SYNOPKG_PATH ?? '/usr/syno/bin/synopkg'

const execFileAsync = promisify(execFile)

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

app.listen(PORT, HOST, () => {
  console.log(`Synology host helper listening on ${HOST}:${PORT}`)
})