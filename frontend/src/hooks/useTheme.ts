import { useSyncExternalStore } from 'react'
import { type Theme, loadTheme, resolveTheme, saveTheme } from '../utils/theme'

// One theme for the whole page, shared by every component that calls useTheme
const media = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()
let theme: Theme = resolveTheme(loadTheme(), media.matches)

function apply(next: Theme) {
  theme = next
  document.documentElement.classList.toggle('dark', next === 'dark')
  listeners.forEach(notify => notify())
}

// Track OS changes until the user picks a theme themselves
media.addEventListener('change', (e) => {
  if (!loadTheme()) apply(e.matches ? 'dark' : 'light')
})

function subscribe(notify: () => void) {
  listeners.add(notify)
  return () => { listeners.delete(notify) }
}

export function useTheme() {
  const current = useSyncExternalStore(subscribe, () => theme)

  function toggleTheme() {
    const next = current === 'dark' ? 'light' : 'dark'
    saveTheme(next)
    apply(next)
  }

  return [current, toggleTheme] as const
}
