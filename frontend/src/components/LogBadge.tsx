// LogBadge 
// Badge for logging event messages

type LogLevel = 'Error' | 'Warning' | 'Info'

interface Props {
  level: string
}

// assign colors to variants (dark mode uses softer tinted versions)
const colorMap: Record<LogLevel, { bg: string; text: string }> = {
  Error:   { bg: 'bg-[#F4AAAA] dark:bg-red-500/20',    text: 'text-black dark:text-red-300' },
  Warning: { bg: 'bg-[#F9F4A8] dark:bg-yellow-400/20', text: 'text-black dark:text-yellow-200' },
  Info:    { bg: 'bg-[#C5C8F0] dark:bg-indigo-400/20', text: 'text-black dark:text-indigo-200' },
}

// assign fallback color 
const fallback = { bg: 'bg-gray-200 dark:bg-gray-700', text: 'text-black dark:text-gray-200' }

// capitalize first letter 
function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

// export function with label and style props
export default function LogBadge({ level }: Props) {
  const label = capitalize(level ?? 'info') as LogLevel
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