// HostBadge Component
// Component for the host (Synology / titan) a service runs on

import type { Host } from '@shared/types'

interface Props {
  host: Host
}

// assign colors to hosts
const colorMap: Record<string, { bg: string; text: string }> = {
  Synology: { bg: 'bg-[#3399FF]', text: 'text-white' },
  Titan:    { bg: 'bg-[#9933FF]', text: 'text-white' },
}

// assign fallback color
const fallback = { bg: 'bg-gray-300', text: 'text-black' }

// capitalize first letter
function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function HostBadge({ host }: Props) {
  const label = capitalize(host ?? 'unknown')
  const style = colorMap[label] ?? fallback

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
