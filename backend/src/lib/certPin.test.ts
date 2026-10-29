import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer, type Server } from 'node:https'
import { X509Certificate } from 'node:crypto'
import { fetch, Agent } from 'undici'
import { normalizeFingerprint, pinnedConnector } from './certPin.js'

const FP = '99:BF:5B:8C:C4:3D:60:01:5D:24:84:5C:21:B6:20:EB:E3:1F:62:44:C7:A9:E4:8D:4D:F2:C2:86:7D:96:74:07'

describe('normalizeFingerprint', () => {
  it('keeps the openssl / Node form', () => {
    expect(normalizeFingerprint(FP)).toBe(FP)
  })

  it('accepts lowercase hex without colons', () => {
    expect(normalizeFingerprint(FP.replace(/:/g, '').toLowerCase())).toBe(FP)
  })

  it('rejects empty, short, and non-hex values', () => {
    expect(normalizeFingerprint('')).toBeNull()
    expect(normalizeFingerprint(FP.slice(0, -3))).toBeNull()
    expect(normalizeFingerprint(FP.replace('99', 'ZZ'))).toBeNull()
  })
})

// A real HTTPS server with a throwaway self-signed certificate.
// Needs the openssl CLI; skipped where it isn't installed.
let hasOpenssl = true
try { execFileSync('openssl', ['version']) } catch { hasOpenssl = false }

describe.skipIf(!hasOpenssl)('pinnedConnector', () => {
  let dir: string
  let server: Server
  let url: string
  let serverFp: string
  const received: string[] = []

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'certpin-'))
    const key = path.join(dir, 'key.pem')
    const cert = path.join(dir, 'cert.pem')
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-subj', '/CN=certpin-test', '-keyout', key, '-out', cert,
    ], { stdio: 'ignore' })

    serverFp = new X509Certificate(readFileSync(cert)).fingerprint256
    server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', () => {
        received.push(body)
        res.end('ok')
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as { port: number }
    url = `https://127.0.0.1:${port}/`
  })

  afterAll(() => {
    server?.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('connects when the fingerprint matches, despite the self-signed cert', async () => {
    const agent = new Agent({ connect: pinnedConnector(serverFp) })
    const res = await fetch(url, { method: 'POST', body: 'hello', dispatcher: agent })
    expect(await res.text()).toBe('ok')
    expect(received).toContain('hello')
  })

  // Regression: undici resumes cached TLS sessions on new connections, and
  // a resumed session reports an empty peer certificate, so every reconnect
  // after the first used to fail the pin until the backend was restarted.
  it('keeps accepting the pinned certificate across reconnects', async () => {
    const agent = new Agent({
      connect: pinnedConnector(serverFp),
      keepAliveTimeout: 50,
      keepAliveMaxTimeout: 50,
    })
    try {
      for (let i = 0; i < 4; i++) {
        const res = await fetch(url, { method: 'POST', body: `reconnect-${i}`, dispatcher: agent })
        expect(await res.text()).toBe('ok')
        await new Promise(resolve => setTimeout(resolve, 150))   // let the connection close
      }
    } finally {
      await agent.close()
    }
    expect(received).toEqual(expect.arrayContaining(['reconnect-0', 'reconnect-1', 'reconnect-2', 'reconnect-3']))
  })

  it('refuses a different certificate before sending anything', async () => {
    const agent = new Agent({ connect: pinnedConnector(FP) })
    const err = await fetch(url, { method: 'POST', body: 'passwd=secret', dispatcher: agent })
      .then(() => null, (e: Error) => e)
    expect((err?.cause as Error | undefined)?.message).toMatch(/fingerprint mismatch/)
    expect(received).not.toContain('passwd=secret')
  })
})
