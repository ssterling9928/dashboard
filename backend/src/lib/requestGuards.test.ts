import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'
import { csrfGuard, proxySecretGuard, requestUser, securityHeaders } from './requestGuards.js'

const SECRET = 's'.repeat(64)

// A small app wired the way server.ts wires the real one
let server: Server
let base: string
let host: string

beforeAll(async () => {
  const app = express()
  app.use(securityHeaders)
  app.use(proxySecretGuard(SECRET))
  app.use('/api', csrfGuard)
  app.get('/api/health', (_req, res) => { res.json({ ok: true }) })
  app.get('/api/data', (_req, res) => { res.json({ data: 1 }) })
  app.post('/api/action', (_req, res) => { res.json({ done: true }) })
  app.get('/', (_req, res) => { res.send('page') })

  server = await new Promise<Server>(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  const { port } = server.address() as { port: number }
  host = `127.0.0.1:${port}`
  base = `http://${host}`
})

afterAll(() => { server?.close() })

const withSecret = (headers: Record<string, string> = {}) => ({ 'X-Proxy-Secret': SECRET, ...headers })
const status = async (path: string, init: RequestInit = {}) => (await fetch(base + path, init)).status

describe('proxySecretGuard', () => {
  it('refuses requests without the secret, API and page alike', async () => {
    expect(await status('/api/data')).toBe(403)
    expect(await status('/')).toBe(403)
  })

  it('refuses a wrong secret', async () => {
    expect(await status('/api/data', { headers: { 'X-Proxy-Secret': 'x'.repeat(64) } })).toBe(403)
  })

  it('lets requests with the secret through', async () => {
    expect(await status('/api/data', { headers: withSecret() })).toBe(200)
    expect(await status('/', { headers: withSecret() })).toBe(200)
  })

  it('leaves /api/health open for the container healthcheck', async () => {
    expect(await status('/api/health')).toBe(200)
  })
})

describe('csrfGuard', () => {
  const post = (headers: Record<string, string>) => status('/api/action', { method: 'POST', headers: withSecret(headers) })

  it('refuses a POST without the custom header', async () => {
    expect(await post({})).toBe(403)
    expect(await post({ 'X-Requested-With': 'XMLHttpRequest' })).toBe(403)
  })

  it('accepts a POST with the header and no Origin, or this site as Origin', async () => {
    expect(await post({ 'X-Requested-With': 'homelab-dashboard' })).toBe(200)
    expect(await post({ 'X-Requested-With': 'homelab-dashboard', Origin: `https://${host}` })).toBe(200)
  })

  it('refuses another site as Origin, even with the header', async () => {
    expect(await post({ 'X-Requested-With': 'homelab-dashboard', Origin: 'https://evil.example' })).toBe(403)
    expect(await post({ 'X-Requested-With': 'homelab-dashboard', Origin: 'null' })).toBe(403)
  })

  it('leaves GETs alone', async () => {
    expect(await status('/api/data', { headers: withSecret() })).toBe(200)
  })
})

describe('securityHeaders and CORS', () => {
  it('sets the hardening headers and offers no CORS', async () => {
    const res = await fetch(`${base}/api/data`, { headers: withSecret({ Origin: 'https://evil.example' }) })
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('content-security-policy')).toBe("frame-ancestors 'none'")
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('requestUser', () => {
  const req = (user?: string) => ({ get: (h: string) => (h === 'x-remote-user' ? user : undefined) }) as never

  it('is "dev" when no proxy is in front', () => {
    expect(requestUser(req('stephen'), false)).toBe('dev')
  })

  it('takes the proxy\'s username, made safe for a log line', () => {
    expect(requestUser(req('stephen'), true)).toBe('stephen')
    expect(requestUser(req('evil\nuser=admin restart'), true)).toBe('evil_user_admin_restart')
    expect(requestUser(req(undefined), true)).toBe('unknown')
  })
})
