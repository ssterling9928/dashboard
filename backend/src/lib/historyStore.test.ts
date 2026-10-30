import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadHistory, parseHistory, saveHistory, type SavedHistory } from './historyStore.js'
import { BUFFER_SIZE } from './metricMath.js'

const NOW = Date.parse('2026-10-30T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000).toISOString()

function saved(overrides: Partial<SavedHistory> = {}): SavedHistory {
  return {
    history: {
      synology: { cpu: [{ time: hoursAgo(1), value: 12 }] },
      titan:    { memory: [{ time: hoursAgo(2), value: 40 }] },
    },
    diskHistory: {
      synology: { '/volume1': [{ time: hoursAgo(1), value: 71 }] },
      titan:    {},
    },
    ...overrides,
  }
}

const file = (data: unknown) => JSON.stringify({ version: 1, ...(data as object) })

describe('parseHistory', () => {
  it('reads back what was saved', () => {
    expect(parseHistory(file(saved()), NOW)).toEqual(saved())
  })

  it('drops readings older than 24 hours', () => {
    const json = file(saved({
      history: {
        synology: { cpu: [{ time: hoursAgo(30), value: 99 }, { time: hoursAgo(1), value: 12 }] },
        titan: {},
      },
    }))
    expect(parseHistory(json, NOW).history.synology.cpu).toEqual([{ time: hoursAgo(1), value: 12 }])
  })

  it('drops malformed readings and unknown hosts instead of trusting them', () => {
    const json = file({
      history: {
        synology: { cpu: [{ time: 'nope', value: 1 }, { time: hoursAgo(1), value: 'x' }, { time: hoursAgo(1), value: 5, extra: true }] },
        titan: { memory: 'not a list' },
        someoneElse: { cpu: [{ time: hoursAgo(1), value: 1 }] },
      },
      diskHistory: null,
    })
    expect(parseHistory(json, NOW)).toEqual({
      history:     { synology: { cpu: [{ time: hoursAgo(1), value: 5 }] }, titan: {} },
      diskHistory: { synology: {}, titan: {} },
    })
  })

  it('keeps at most one buffer of readings per series', () => {
    const points = Array.from({ length: BUFFER_SIZE + 10 }, () => ({ time: hoursAgo(1), value: 1 }))
    const json = file({ history: { synology: { cpu: points }, titan: {} }, diskHistory: {} })
    expect(parseHistory(json, NOW).history.synology.cpu).toHaveLength(BUFFER_SIZE)
  })

  it('rejects a file from another version', () => {
    expect(() => parseHistory(JSON.stringify({ version: 2 }), NOW)).toThrow(/version/)
  })
})

describe('saveHistory / loadHistory', () => {
  let dir: string | undefined
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

  it('round-trips through the file, creating its folder, leaving no temp file', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'history-'))
    const target = path.join(dir, 'data', 'history.json')
    const recent = saved({
      history: { synology: { cpu: [{ time: new Date().toISOString(), value: 3 }] }, titan: {} },
      diskHistory: { synology: {}, titan: {} },
    })

    await saveHistory(target, recent)

    expect(await loadHistory(target)).toEqual(recent)
    expect(readdirSync(path.dirname(target))).toEqual(['history.json'])
  })

  it('starts empty when the file is missing or corrupt', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'history-'))
    expect(await loadHistory(path.join(dir, 'missing.json'))).toBeNull()

    const corrupt = path.join(dir, 'corrupt.json')
    writeFileSync(corrupt, '{"version":1,"history":')
    expect(await loadHistory(corrupt)).toBeNull()
  })
})
