import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer, type Server } from 'node:https'
import { X509Certificate } from 'node:crypto'

// A stand-in NAS helper: HTTPS with a throwaway self-signed certificate,
// recording the Authorization header of every request it receives.
// Needs the openssl CLI; skipped where it isn't installed.
let hasOpenssl = true
try { execFileSync('openssl', ['version']) } catch { hasOpenssl = false }

const TOKEN = 'a'.repeat(64)

describe.skipIf(!hasOpenssl)('NAS helper client', () => {
  let dir: string
  let server: Server
  let url: string
  let fingerprint: string
  const authHeaders: Array<string | undefined> = []
  const requests: string[] = []

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'nashelper-'))
    const key = path.join(dir, 'key.pem')
    const cert = path.join(dir, 'cert.pem')
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-subj', '/CN=nashelper-test', '-keyout', key, '-out', cert,
    ], { stdio: 'ignore' })

    fingerprint = new X509Certificate(readFileSync(cert)).fingerprint256
    server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
      authHeaders.push(req.headers.authorization)
      requests.push(`${req.method} ${req.url}`)
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify([{ id: 'Pkg', name: 'Pkg', version: '1.0', type: 'package' }]))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as { port: number }
    url = `https://127.0.0.1:${port}`
  })

  afterAll(() => {
    server?.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  beforeEach(() => {
    authHeaders.length = 0
    requests.length = 0
    vi.resetModules()   // the client reads its settings when first imported
  })

  async function loadClient(env: Record<string, string>) {
    vi.stubEnv('SYNO_HELPER_URL', url)
    vi.stubEnv('SYNO_HELPER_TOKEN', TOKEN)
    vi.stubEnv('SYNO_HELPER_CERT_SHA256', '')
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    return import('./nasHelper.js')
  }

  it('sends the bearer token over the pinned connection', async () => {
    const client = await loadClient({ SYNO_HELPER_CERT_SHA256: fingerprint })
    await expect(client.getNasPackages()).resolves.toHaveLength(1)
    expect(authHeaders).toEqual([`Bearer ${TOKEN}`])
  })

  it('refuses to send anything without a pin', async () => {
    const client = await loadClient({})
    await expect(client.getNasPackages()).rejects.toThrow(/refusing to contact/)
    expect(authHeaders).toEqual([])
  })

  it('refuses a different certificate before the token is sent', async () => {
    const wrong = fingerprint.replace(/^../, fingerprint.startsWith('00') ? '11' : '00')
    const client = await loadClient({ SYNO_HELPER_CERT_SHA256: wrong })
    const err = await client.getNasPackages().then(() => null, (e: Error) => e)
    expect(err?.message).toMatch(/NAS helper unreachable: .*SYNO_HELPER_CERT_SHA256/)
    expect(authHeaders).toEqual([])
  })

  it('sends container actions as POSTs to the container\'s path', async () => {
    const client = await loadClient({ SYNO_HELPER_CERT_SHA256: fingerprint })
    await client.nasContainerAction('node-exporter', 'restart')
    await client.getNasContainer('a b')
    expect(requests).toEqual(['POST /containers/node-exporter/restart', 'GET /containers/a%20b'])
    expect(authHeaders).toEqual([`Bearer ${TOKEN}`, `Bearer ${TOKEN}`])
  })
})
