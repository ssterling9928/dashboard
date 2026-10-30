import type { NextFunction, Request, Response } from 'express'
import { createHash, timingSafeEqual } from 'node:crypto'

// Middleware that keeps the NPM login from being bypassed or abused.
//
// The dashboard sits behind Nginx Proxy Manager, which asks for a password
// (basic auth). That only helps if every request really came through NPM,
// and basic auth makes the browser attach the password to any request to
// this origin, including ones a malicious page triggers. Hence:
//   - proxySecretGuard: NPM adds X-Proxy-Secret; without it, 403. Anything
//     else on the Docker network that calls the container directly gets nothing.
//   - csrfGuard: state-changing requests need a custom header that a
//     cross-site page can't send (no CORS is offered, so the browser's
//     preflight fails), and a matching Origin if the browser sends one.
//   - securityHeaders: no sniffing, no framing, no referrer, no X-Powered-By.

export const PROXY_SECRET_HEADER = 'x-proxy-secret'
export const CSRF_HEADER = 'x-requested-with'
export const CSRF_VALUE = 'homelab-dashboard'
export const MIN_SECRET_LENGTH = 32

// Paths that don't need the proxy secret: the container's own healthcheck
// calls /api/health directly, and it reveals nothing
const OPEN_PATHS = new Set(['/api/health'])

// Compare digests so the comparison takes the same time whatever the input
function secretMatches(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

export function proxySecretGuard(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (OPEN_PATHS.has(req.path)) return next()
    if (secretMatches(req.get(PROXY_SECRET_HEADER) ?? '', secret)) return next()
    res.status(403).json({ error: 'Forbidden' })
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next()

  if (req.get(CSRF_HEADER) !== CSRF_VALUE) {
    return res.status(403).json({ error: 'Missing request header' })
  }

  // Browsers send Origin on cross-origin and most same-origin POSTs; if it's
  // there, it must be this site
  const origin = req.get('origin')
  if (origin) {
    let originHost = ''
    try { originHost = new URL(origin).host } catch { /* malformed: rejected below */ }
    if (originHost !== req.get('host')) {
      return res.status(403).json({ error: 'Cross-origin request refused' })
    }
  }

  next()
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'")
  res.setHeader('Referrer-Policy', 'no-referrer')
  next()
}

// Who asked for a container action. NPM passes the basic-auth username as
// X-Remote-User; it can only be trusted because proxySecretGuard ensures
// the request came through NPM (in dev there's no NPM, so it's "dev").
export function requestUser(req: Request, proxyEnforced: boolean): string {
  if (!proxyEnforced) return 'dev'
  const user = req.get('x-remote-user')?.trim()
  return user ? user.replace(/[^\w.@-]/g, '_').slice(0, 64) : 'unknown'
}
