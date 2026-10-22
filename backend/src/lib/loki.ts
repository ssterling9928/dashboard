import { getJson } from './http.js'

// Loki runs on titan's `private` Docker network — reachable by container name
const LOKI_URL =
  process.env.LOKI_URL?.replace(/\/+$/, '') ?? 'http://loki:3100'

export interface LokiEntry {
  timestampNs: string
  line:        string
  labels:      Record<string, string>
}

interface LokiQueryRangeResponse {
  data: {
    result: Array<{
      stream: Record<string, string>
      values: Array<[string, string]>
    }>
  }
}

// Newest `limit` log lines matching `query` within the last `sinceHours`, newest first
export async function queryLogs(query: string, limit: number, sinceHours = 24): Promise<LokiEntry[]> {
  const url = new URL(`${LOKI_URL}/loki/api/v1/query_range`)
  url.searchParams.set('query', query)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('direction', 'backward')
  url.searchParams.set('start', String((Date.now() - sinceHours * 60 * 60 * 1000) * 1_000_000))

  const data = await getJson<LokiQueryRangeResponse>(url.toString())

  return data.data.result
    .flatMap(stream => stream.values.map(([timestampNs, line]) => ({
      timestampNs,
      line,
      labels: stream.stream,
    })))
    .sort((a, b) => (BigInt(b.timestampNs) > BigInt(a.timestampNs) ? 1 : -1))
    .slice(0, limit)
}
