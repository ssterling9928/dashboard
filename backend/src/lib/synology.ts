import 'dotenv/config'
import { fetch, Agent } from 'undici'
import type { SynoParams } from "./../types/types.js"
import { normalizeFingerprint, pinnedConnector } from './certPin.js'
import { UpstreamError, fetchFailureReason } from './http.js'

const BASE = process.env.SYNO_HOST!
const USER = process.env.SYNO_USER!
const PASS = process.env.SYNO_PASS!

// The NAS is trusted by its certificate's SHA-256 fingerprint (see certPin.ts).
// Fails closed: without a valid SYNO_CERT_SHA256, no request (and so no
// password) is ever sent.
const CERT_SHA256 = normalizeFingerprint(process.env.SYNO_CERT_SHA256 ?? '')
const agent = CERT_SHA256
  ? new Agent({ connect: pinnedConnector(CERT_SHA256) })
  : null

const TIMEOUT_MS = 15000

// DSM error codes that mean "this session is no longer valid": timed out,
// interrupted by another login, or unknown SID. Logging in again fixes them.
const SESSION_ERRORS = new Set([106, 107, 119])

export function isSessionError(code: unknown): boolean {
  return typeof code === 'number' && SESSION_ERRORS.has(code)
}

// The DSM codes worth explaining when they show up in an alert or log line
const DSM_ERRORS: Record<number, string> = {
  105: 'permission denied',
  106: 'session timed out',
  107: 'session interrupted by another login',
  119: 'session not found',
  400: 'wrong account or password',
  401: 'account disabled',
  402: 'permission denied',
  403: '2-factor code required',
  407: 'IP blocked by DSM auto-block',
}

export function describeDsmError(code: unknown): string {
  if (typeof code !== 'number') return 'unknown error'
  const meaning = DSM_ERRORS[code]
  return meaning ? `code ${code} (${meaning})` : `code ${code}`
}

// Every call is a POST with its parameters in the body. In a URL, the
// password and session ID would end up in access logs.
async function postEntry(
  params: Record<string, string>,
  headers: Record<string, string> = {}
): Promise<any> {
  if (!agent) {
    throw new Error('SYNO_CERT_SHA256 is missing or invalid; refusing to contact the NAS')
  }

  const res = await fetch(`${BASE}/webapi/entry.cgi`, {
    method: 'POST',
    dispatcher: agent,
    headers,
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((err: unknown) => {
    throw new UpstreamError(`DSM unreachable: ${fetchFailureReason(err, TIMEOUT_MS)}`, { cause: err })
  })

  if (!res.ok) {
    throw new UpstreamError(`DSM returned ${res.status}`)
  }
  return res.json().catch(() => {
    throw new UpstreamError('DSM returned a response that is not JSON')
  })
}

interface SynoSession {
  sid: string
  token: string
}

let session: SynoSession | null = null

// While a login is in flight, every caller waits for that one. Separate
// logins with the same session name interrupt each other (code 107), so
// parallel requests each logging in would knock each other out.
let loggingIn: Promise<SynoSession> | null = null

async function login(): Promise<SynoSession> {
  const data = await postEntry({
    api: 'SYNO.API.Auth',
    version: '7',
    method: 'login',
    account: USER,
    passwd: PASS,
    session: 'dashboard',
    format: 'sid',
    enable_syno_token: 'yes',
  })

  if (!data.success) {
    throw new UpstreamError(`Synology login failed: ${describeDsmError(data.error?.code)}`)
  }

  session = {
    sid: data.data.sid,
    token: data.data.synotoken,
  }

  console.log('✅ Synology session established')
  return session
}

export async function getSession(): Promise<SynoSession> {
  if (session) return session
  loggingIn ??= login().finally(() => { loggingIn = null })
  return loggingIn
}

export async function synoRequest(
  api: string,
  method: string,
  version: number,
  extra: SynoParams = {},
  retried = false
): Promise<any> {
  const sess = await getSession()

  const params: Record<string, string> = {
    api,
    version: String(version),
    method,
    _sid: sess.sid,
  }
  for (const [key, value] of Object.entries(extra)) {
    params[key] = Array.isArray(value) ? value.join(',') : String(value)
  }

  const data = await postEntry(params, { 'X-SYNO-TOKEN': sess.token })

  // Session no longer valid: log in again once and retry. Only drop the
  // session if it's still the one that failed; a parallel request may
  // already have replaced it.
  if (!data.success && isSessionError(data.error?.code)) {
    if (retried) {
      throw new UpstreamError(`Synology session could not be refreshed: ${describeDsmError(data.error?.code)}`)
    }
    if (session === sess) session = null
    return synoRequest(api, method, version, extra, true)
  }

  if (!data.success) {
    throw new UpstreamError(`Synology API error [${api}/${method}]: ${describeDsmError(data.error?.code)}`)
  }

  return data.data
}