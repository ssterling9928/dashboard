export type Theme = 'light' | 'dark'

// Keep in sync with the inline script in index.html, which applies the
// theme before React loads so the page doesn't flash light on refresh
export const THEME_STORAGE_KEY = 'theme'

type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>

// The user's explicit choice, or null if they've never toggled. `storage`
// defaults to localStorage, which can be missing or throw (private windows etc.)
export function loadTheme(storage?: ThemeStorage): Theme | null {
  try {
    const saved = (storage ?? localStorage).getItem(THEME_STORAGE_KEY)
    return saved === 'light' || saved === 'dark' ? saved : null
  } catch {
    return null
  }
}

export function saveTheme(theme: Theme, storage?: ThemeStorage) {
  try {
    (storage ?? localStorage).setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Storage unavailable — theme just won't persist
  }
}

// An explicit choice wins; otherwise follow the OS setting
export function resolveTheme(saved: Theme | null, prefersDark: boolean): Theme {
  return saved ?? (prefersDark ? 'dark' : 'light')
}
