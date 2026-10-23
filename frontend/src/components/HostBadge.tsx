// HostBadge Component
// Component for the host (Vault / Titan) a service runs on

import type { Host } from '@shared/types'

interface Props {
  host: Host
}

// Display name and colors per host. The internal id ('synology') stays in the
// API; users see the host's own name.
const HOSTS: Record<Host, { label: string; bg: string; text: string }> = {
  synology: { label: 'Vault', bg: 'bg-[#3399FF]', text: 'text-white' },
  titan:    { label: 'Titan', bg: 'bg-[#9933FF]', text: 'text-white' },
}

// assign fallback color
const fallback = { bg: 'bg-gray-300 dark:bg-gray-700', text: 'text-black dark:text-gray-200' }

export default function HostBadge({ host }: Props) {
  const known = HOSTS[host] as (typeof HOSTS)[Host] | undefined
  const label = known?.label ?? 'Unknown'
  const style = known ?? fallback

  return (
    <span
      className={`
        inline-flex items-center justify-center
        px-3 py-1 rounded-full
        text-xs font-bold tracking-wide
        ${style.bg} ${style.text}
      `}
    >
      {label}
    </span>
  )
}
