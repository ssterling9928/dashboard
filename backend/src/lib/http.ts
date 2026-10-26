export async function getJson<T>(
  url: string,
  timeoutMs = 10000,
  headers: Record<string, string> = {},
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', ...headers },
      signal: controller.signal,
    })

    if (!response.ok) {
    
      const body = await response.text().catch(() => '')
      throw new Error(`Request failed (${response.status}): ${body || response.statusText}`)
    }

    return (await response.json()) as T
  } finally {
    clearTimeout(timeout)
  }
}

export async function postJson<T>(
  url: string,
  timeoutMs = 10000,
  headers: Record<string, string> = {},
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', ...headers },
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Request failed (${response.status}): ${body || response.statusText}`)
    }

    return (await response.json()) as T
  } finally {
    clearTimeout(timeout)
  }
}

// fetch() rejects with a generic "fetch failed" — the useful part is in .cause
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  const cause = err.cause as { code?: string; message?: string } | undefined
  return cause?.code ?? cause?.message ?? err.message
}
