import { useState } from 'react'
import type { Host } from '@shared/types'

const HOSTS: Host[] = ['synology', 'titan']

// Selected host for a tab, remembered across page refreshes
export function useHostSelection(storageKey: string, fallback: Host = 'synology') {
  const [host, setHostState] = useState<Host>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      return HOSTS.includes(saved as Host) ? (saved as Host) : fallback
    } catch {
      return fallback
    }
  })

  function setHost(next: Host) {
    setHostState(next)
    try {
      localStorage.setItem(storageKey, next)
    } catch {
      // Storage unavailable — selection just won't persist
    }
  }

  return [host, setHost] as const
}
