import { fetch, Agent } from 'undici'
import type { Package, PackageDetail } from '../types/types.js'
import type { ContainerInspect, ContainerSummary } from './containers.js'
import { normalizeFingerprint, pinnedConnector } from './certPin.js'
import { UpstreamError, fetchFailureReason } from './http.js'

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

async function helperRequest<T>(method: 'GET' | 'POST', path: string, timeoutMs: number): Promise<T> {
  if (!agent) {
    throw new Error('SYNO_HELPER_CERT_SHA256 is missing or invalid; refusing to contact the NAS helper')
  }

  const response = await fetch(`${SYNO_HELPER_URL}${path}`, {
    method,
    dispatcher: agent,
    headers: { Accept: 'application/json', ...AUTH },
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((err: unknown) => {
    throw new UpstreamError(`NAS helper unreachable: ${fetchFailureReason(err, timeoutMs)}`, { cause: err })
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new UpstreamError(`NAS helper returned ${response.status}: ${body || response.statusText}`)
  }

  return (await response.json()) as T
}

function helperGet<T>(path: string, timeoutMs = 10000): Promise<T> {
  return helperRequest<T>('GET', path, timeoutMs)
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

export function getNasContainers(): Promise<ContainerSummary[]> {
  return helperGet<ContainerSummary[]>('/containers')
}

export function getNasContainer(name: string): Promise<ContainerInspect> {
  return helperGet<ContainerInspect>(`/containers/${encodeURIComponent(name)}`)
}

// Stopping a container waits up to 10s for it to exit before Docker kills
// it, so actions get longer than reads. The read-only token gets a 403.
export async function nasContainerAction(
  name: string,
  action: 'start' | 'stop' | 'restart'
): Promise<void> {
  await helperRequest('POST', `/containers/${encodeURIComponent(name)}/${action}`, 60000)
}
