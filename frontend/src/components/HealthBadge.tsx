// HealthBadge Component 
// Component for container status badge

interface Props {
  status: string
  color?: string // optional override
}

// assign colors to statuses (dark mode uses softer tinted versions)
const colorMap: Record<string, { bg: string; text: string }> = {
  Healthy: { bg: 'bg-[#33FF00] dark:bg-green-500/20', text: 'text-black dark:text-green-300' },
  Warning: { bg: 'bg-[#FFFF00] dark:bg-yellow-400/20', text: 'text-black dark:text-yellow-200' },
  Down:    { bg: 'bg-[#FF3333] dark:bg-red-500/20', text: 'text-black dark:text-red-300' },
  Running: { bg: 'bg-[#33FF00] dark:bg-green-500/20', text: 'text-black dark:text-green-300' },
  Stopped: { bg: 'bg-[#FF3333] dark:bg-red-500/20', text: 'text-black dark:text-red-300' },
  Exited:  { bg: 'bg-[#FF3333] dark:bg-red-500/20', text: 'text-black dark:text-red-300' },
  Paused:  { bg: 'bg-[#FFFF00] dark:bg-yellow-400/20', text: 'text-black dark:text-yellow-200' },
}

// assign fallback color 
const fallback = { bg: 'bg-gray-300 dark:bg-gray-700', text: 'text-black dark:text-gray-200' }

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
        px-3 py-1 rounded-full
        text-xs font-bold tracking-wide
        ${style.bg} ${style.text}
      `}
    >
      {label}
    </span>
  )
}