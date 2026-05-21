// LogBadge 
// Badge for logging event messages

type LogLevel = 'Error' | 'Warning' | 'Info'

interface Props {
  level: string
}

// assign colors to variants 
const colorMap: Record<LogLevel, { bg: string; text: string }> = {
  Error:   { bg: 'bg-[#F4AAAA]', text: 'text-black' },
  Warning: { bg: 'bg-[#F9F4A8]', text: 'text-black' },
  Info:    { bg: 'bg-[#C5C8F0]', text: 'text-black' },
}

// assign fallback color 
const fallback = { bg: 'bg-gray-200', text: 'text-black' }

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