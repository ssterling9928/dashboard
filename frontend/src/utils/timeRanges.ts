export const TIME_RANGES = [
  { label: '1hr',   hours: 1,  subtitle: 'Last Hour' },
  { label: '6hrs',  hours: 6,  subtitle: 'Last 6 Hours' },
  { label: '24hrs', hours: 24, subtitle: 'Last 24 Hours' },
]
export const DEFAULT_HOURS = 24

type RangeStorage = Pick<Storage, 'getItem' | 'setItem'>

// Remember each chart's range across page refreshes. `storage` defaults to
// localStorage, which can be missing or throw (private windows etc.)
export function loadRange(type: string, storage?: RangeStorage): number {
  try {
    const saved = Number((storage ?? localStorage).getItem(`metrics-range:${type}`))
    return TIME_RANGES.some(r => r.hours === saved) ? saved : DEFAULT_HOURS
  } catch {
    return DEFAULT_HOURS
  }
}

export function saveRange(type: string, hours: number, storage?: RangeStorage) {
  try {
    (storage ?? localStorage).setItem(`metrics-range:${type}`, String(hours))
  } catch {
    // Storage unavailable — range just won't persist
  }
}
