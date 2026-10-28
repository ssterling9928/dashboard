import { fetch, Agent } from 'undici'
import type { Package, PackageDetail } from '../types/types.js'
import { normalizeFingerprint, pinnedConnector } from './certPin.js'

// Client for the NAS helper (host-helper.ts on Vault). Requests cross the
// LAN, so it's HTTPS only, and the helper's self-signed certificate is
// trusted by its SHA-256 fingerprint (see certPin.ts). Fails closed: without
// a valid SYNO_HELPER_CERT_SHA256 no request (and so no token) is sent.
const SYNO_HELPER_URL =
  process.env.SYNO_HELPER_URL?.replace(/\/+$/, '') ?? 'https://YOUR_NAS_IP:4111'

const CERT_SHA256 = normalizeFingerprint(process.env.SYNO_HELPER_CERT_SHA256 ?? '')
const agent = CERT_SHA256
  ? new Agent({ connect: pinnedConnector(CERT_SHA256, 'SYNO_HELPER_CERT_SHA256') })
  : null

// Full-access token in production; dev uses the helper's read-only token
const AUTH = { Authorization: `Bearer ${process.env.SYNO_HELPER_TOKEN ?? ''}` }

async function helperGet<T>(path: string, timeoutMs = 10000): Promise<T> {
  if (!agent) {
    throw new Error('SYNO_HELPER_CERT_SHA256 is missing or invalid; refusing to contact the NAS helper')
  }

  const response = await fetch(`${SYNO_HELPER_URL}${path}`, {
    dispatcher: agent,
    headers: { Accept: 'application/json', ...AUTH },
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Request failed (${response.status}): ${body || response.statusText}`)
  }

  return (await response.json()) as T
}

export function getNasPackages(): Promise<Package[]> {
  return helperGet<Package[]>('/packages')
}

export function getNasPackage(id: string): Promise<PackageDetail> {
  return helperGet<PackageDetail>(`/packages/${encodeURIComponent(id)}`)
}

export function getNasHelperHealth(timeoutMs = 5000): Promise<unknown> {
  return helperGet('/health', timeoutMs)
}
