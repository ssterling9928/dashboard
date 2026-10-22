import { describe, expect, it } from 'vitest'
import { DEFAULT_HOURS, loadRange, saveRange } from './timeRanges'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    data,
  }
}

const brokenStorage = {
  getItem: () => { throw new Error('SecurityError') },
  setItem: () => { throw new Error('QuotaExceededError') },
}

describe('saved chart ranges', () => {
  it('round-trips a range per chart type', () => {
    const storage = memoryStorage()
    saveRange('cpu', 6, storage)
    saveRange('disk', 1, storage)
    expect(loadRange('cpu', storage)).toBe(6)
    expect(loadRange('disk', storage)).toBe(1)
    expect(storage.data.get('metrics-range:cpu')).toBe('6')
  })

  it('falls back to the default when nothing or something invalid is saved', () => {
    expect(loadRange('cpu', memoryStorage())).toBe(DEFAULT_HOURS)
    expect(loadRange('cpu', memoryStorage({ 'metrics-range:cpu': '168' }))).toBe(DEFAULT_HOURS) // old "7days"
    expect(loadRange('cpu', memoryStorage({ 'metrics-range:cpu': 'abc' }))).toBe(DEFAULT_HOURS)
  })

  it('never throws when storage is unavailable', () => {
    expect(loadRange('cpu', brokenStorage)).toBe(DEFAULT_HOURS)
    expect(() => saveRange('cpu', 6, brokenStorage)).not.toThrow()
  })
})
