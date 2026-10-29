import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer, type Server } from 'node:https'
import { X509Certificate } from 'node:crypto'
import { describeDsmError, isSessionError } from './synology.js'

describe('isSessionError', () => {
  it('is true only for codes that a new login fixes', () => {
    expect([106, 107, 119].map(isSessionError)).toEqual([true, true, true])
    expect([105, 400, 407, undefined, '119'].map(isSessionError)).toEqual([false, false, false, false, false])
  })
})

describe('describeDsmError', () => {
  it('explains the codes worth explaining', () => {
    expect(describeDsmError(407)).toBe('code 407 (IP blocked by DSM auto-block)')
    expect(describeDsmError(400)).toBe('code 400 (wrong account or password)')
  })

  it('falls back to the bare code, or "unknown error"', () => {
    expect(describeDsmError(9999)).toBe('code 9999')
    expect(describeDsmError(undefined)).toBe('unknown error')
  })
})

// A fake DSM: HTTPS with a throwaway certificate, handing out numbered
// sessions. A test can expire the current session with a given error code
// on the next call, reject logins, or break the API.
// Needs the openssl CLI; skipped where it isn't installed.
let hasOpenssl = true
try { execFileSync('openssl', ['version']) } catch { hasOpenssl = false }

describe.skipIf(!hasOpenssl)('synoRequest against a fake DSM', () => {
  let dir: string
  let server: Server
  let url: string
  let fingerprint: string

  const dsm = {
    logins: 0,
    validSid: '',
    expireWith: 0 as number,    // next API call answers with this error code
    loginError: 0 as number,    // logins fail with this code
    alwaysExpire: false,        // every API call answers 119
    bodies: [] as string[],
  }

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'fakedsm-'))
    const key = path.join(dir, 'key.pem')
    const cert = path.join(dir, 'cert.pem')
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-subj', '/CN=fakedsm', '-keyout', key, '-out', cert,
    ], { stdio: 'ignore' })
    fingerprint = new X509Certificate(readFileSync(cert)).fingerprint256

    server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', () => {
        dsm.bodies.push(body)
        const p = new URLSearchParams(body)
        const reply = (data: unknown) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        }

        if (p.get('api') === 'SYNO.API.Auth') {
          if (dsm.loginError) return reply({ success: false, error: { code: dsm.loginError } })
          dsm.logins += 1
          dsm.validSid = `sid-${dsm.logins}`
          return reply({ success: true, data: { sid: dsm.validSid, synotoken: `tok-${dsm.logins}` } })
        }

        if (dsm.alwaysExpire) return reply({ success: false, error: { code: 119 } })
        if (dsm.expireWith) {
          const code = dsm.expireWith
          dsm.expireWith = 0
          dsm.validSid = ''           // the old session is gone for good
          return reply({ success: false, error: { code } })
        }
        if (p.get('_sid') !== dsm.validSid) return reply({ success: false, error: { code: 119 } })
        if (p.get('api') === 'BROKEN') return reply({ success: false, error: { code: 9999 } })
        return reply({ success: true, data: { sid: p.get('_sid') } })
      })
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

  // resetModules gives each test its own copy of http.js, so `instanceof
  // UpstreamError` would compare different classes; check the status instead
  const upstream = (message: string) => expect.objectContaining({ status: 502, message })

  beforeEach(() => {
    Object.assign(dsm, { logins: 0, validSid: '', expireWith: 0, loginError: 0, alwaysExpire: false, bodies: [] })
    vi.resetModules()   // fresh module = no session yet, settings re-read
  })

  async function loadClient(env: Record<string, string> = {}) {
    vi.stubEnv('SYNO_HOST', url)
    vi.stubEnv('SYNO_USER', 'dashboard-api')
    vi.stubEnv('SYNO_PASS', 'pw')
    vi.stubEnv('SYNO_CERT_SHA256', fingerprint)
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    return import('./synology.js')
  }

  it('logs in once and reuses the session', async () => {
    const { synoRequest } = await loadClient()
    await synoRequest('X', 'get', 1)
    await synoRequest('X', 'get', 1)
    expect(dsm.logins).toBe(1)
  })

  it.each([106, 107, 119])('logs in again and retries on session error %i', async (code) => {
    const { synoRequest } = await loadClient()
    await synoRequest('X', 'get', 1)
    dsm.expireWith = code
    await expect(synoRequest('X', 'get', 1)).resolves.toEqual({ sid: 'sid-2' })
    expect(dsm.logins).toBe(2)
  })

  it('shares one login between parallel requests after the session expires', async () => {
    const { synoRequest } = await loadClient()
    await synoRequest('X', 'get', 1)
    dsm.validSid = ''   // expire it server-side; every request will see 119
    const results = await Promise.all(Array.from({ length: 5 }, () => synoRequest('X', 'get', 1)))
    expect(results).toEqual(Array(5).fill({ sid: 'sid-2' }))
    expect(dsm.logins).toBe(2)
  })

  it('shares one login between parallel first requests', async () => {
    const { synoRequest } = await loadClient()
    await Promise.all(Array.from({ length: 5 }, () => synoRequest('X', 'get', 1)))
    expect(dsm.logins).toBe(1)
  })

  it('gives up after one retry if the session keeps failing', async () => {
    const { synoRequest } = await loadClient()
    dsm.alwaysExpire = true
    const err = await synoRequest('X', 'get', 1).then(() => null, (e: Error) => e)
    expect(err).toEqual(upstream('Synology session could not be refreshed: code 119 (session not found)'))
    expect(dsm.logins).toBe(2)
  })

  it('reports a failed login with what the code means', async () => {
    const { synoRequest } = await loadClient()
    dsm.loginError = 400
    await expect(synoRequest('X', 'get', 1)).rejects.toThrow('Synology login failed: code 400 (wrong account or password)')
  })

  it('reports other API errors as upstream errors', async () => {
    const { synoRequest } = await loadClient()
    const err = await synoRequest('BROKEN', 'get', 1).then(() => null, (e: Error) => e)
    expect(err).toEqual(upstream('Synology API error [BROKEN/get]: code 9999'))
  })

  it('names the network failure when DSM is unreachable', async () => {
    // A port nothing listens on: bind one, note it, close it again
    const closed = createServer()
    await new Promise<void>(resolve => closed.listen(0, '127.0.0.1', resolve))
    const { port } = closed.address() as { port: number }
    await new Promise<void>(resolve => closed.close(() => resolve()))

    const { synoRequest } = await loadClient({ SYNO_HOST: `https://127.0.0.1:${port}` })
    const err = await synoRequest('X', 'get', 1).then(() => null, (e: Error) => e)
    expect(err).toEqual(upstream('DSM unreachable: ECONNREFUSED'))
  })

  it('sends nothing, not even the login, without a valid pin', async () => {
    const { synoRequest } = await loadClient({ SYNO_CERT_SHA256: '' })
    await expect(synoRequest('X', 'get', 1)).rejects.toThrow(/refusing to contact/)
    expect(dsm.bodies).toEqual([])
  })
})
