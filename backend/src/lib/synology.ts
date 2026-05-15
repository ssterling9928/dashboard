import 'dotenv/config'
import { fetch, Agent } from 'undici'

const BASE = process.env.SYNO_HOST!
const USER = process.env.SYNO_USER!
const PASS = process.env.SYNO_PASS!

// undici Agent — properly disables TLS verification for self-signed NAS cert
const agent = new Agent({
  connect: {
    rejectUnauthorized: false,
  },
})

interface SynoSession {
  sid: string
  token: string
}

let session: SynoSession | null = null

async function login(): Promise<SynoSession> {
  const url = new URL(`${BASE}/webapi/entry.cgi`)
  url.searchParams.set('api', 'SYNO.API.Auth')
  url.searchParams.set('version', '7')
  url.searchParams.set('method', 'login')
  url.searchParams.set('account', USER)
  url.searchParams.set('passwd', PASS)
  url.searchParams.set('session', 'dashboard')
  url.searchParams.set('format', 'sid')
  url.searchParams.set('enable_syno_token', 'yes')

  const res = await fetch(url.toString(), { dispatcher: agent })
  const data = await res.json() as any

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
  extra: Record<string, string> = {}
): Promise<any> {
  const sess = await getSession()

  const url = new URL(`${BASE}/webapi/entry.cgi`)
  url.searchParams.set('api', api)
  url.searchParams.set('version', String(version))
  url.searchParams.set('method', method)
  url.searchParams.set('_sid', sess.sid)

  for (const [k, v] of Object.entries(extra)) {
    url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString(), {
    dispatcher: agent,
    headers: { 'X-SYNO-TOKEN': sess.token },
  })

  const data = await res.json() as any

  // Session expired — re-login once and retry
  if (!data.success && data.error?.code === 119) {
    session = null
    return synoRequest(api, method, version, extra)
  }

  if (!data.success) {
    throw new Error(`Synology API error [${api}/${method}]: code ${data.error?.code}`)
  }

  return data.data
}