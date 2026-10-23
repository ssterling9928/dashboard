import { describe, expect, it } from 'vitest'
import { THEME_STORAGE_KEY, loadTheme, resolveTheme, saveTheme } from './theme'

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

describe('saved theme', () => {
  it('round-trips the chosen theme', () => {
    const storage = memoryStorage()
    saveTheme('dark', storage)
    expect(loadTheme(storage)).toBe('dark')
    saveTheme('light', storage)
    expect(loadTheme(storage)).toBe('light')
  })

  it('returns null when nothing has been chosen', () => {
    expect(loadTheme(memoryStorage())).toBeNull()
  })

  it('ignores unrecognised saved values', () => {
    expect(loadTheme(memoryStorage({ [THEME_STORAGE_KEY]: 'sepia' }))).toBeNull()
  })

  it('survives storage that throws', () => {
    expect(loadTheme(brokenStorage)).toBeNull()
    expect(() => saveTheme('dark', brokenStorage)).not.toThrow()
  })
})

describe('resolveTheme', () => {
  it('follows the OS when nothing is saved', () => {
    expect(resolveTheme(null, true)).toBe('dark')
    expect(resolveTheme(null, false)).toBe('light')
  })

  it('prefers the saved choice over the OS', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})
