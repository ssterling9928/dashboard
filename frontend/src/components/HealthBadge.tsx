// HealthBadge Component 
// Component for container status badge

interface Props {
  status: string
  color?: string // optional override
}

// assign colors to statuses
const colorMap: Record<string, { bg: string; text: string }> = {
  Healthy: { bg: 'bg-[#33FF00]', text: 'text-black' },
  Warning: { bg: 'bg-[#FFFF00]', text: 'text-black' },
  Down:    { bg: 'bg-[#FF3333]', text: 'text-black' },
  Running: { bg: 'bg-[#33FF00]', text: 'text-black' },
  Stopped: { bg: 'bg-[#FF3333]', text: 'text-black' },
  Paused:  { bg: 'bg-[#FFFF00]', text: 'text-black' },
}

// assign fallback color 
const fallback = { bg: 'bg-gray-300', text: 'text-black' }

// capitalize first letter
function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function HealthBadge({ status }: Props) {
  const label = capitalize(status ?? 'unknown')
  const style = colorMap[label] ?? fallback

  return (
    <span
      className={`
        inline-flex items-center justify-center
        px-5 py-2 rounded-full
        text-sm font-black tracking-wide
        ${style.bg} ${style.text}
      `}
    >
      {label}
    </span>
  )
}