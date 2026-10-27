import 'dotenv/config'
import { fetch, Agent } from 'undici'
import type { SynoParams } from "./../types/types.js"
import { normalizeFingerprint, pinnedConnector } from './certPin.js'

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
  })
  return res.json()
}

interface SynoSession {
  sid: string
  token: string
}

let session: SynoSession | null = null

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
    throw new Error(`Synology login failed: error code ${data.error?.code}`)
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
  return login()
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

  // Session expired — re-login once and retry
  if (!data.success && data.error?.code === 119) {
    if (retried) throw new Error('Synology session could not be refreshed')
    session = null
    return synoRequest(api, method, version, extra, true)
  }

  if (!data.success) {
    throw new Error(`Synology API error [${api}/${method}]: code ${data.error?.code}`)
  }

  return data.data
}