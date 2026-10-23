// ThemeToggle Component
// Sliding switch in the header that turns dark mode on and off

import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

export default function ThemeToggle() {
  const [theme, toggleTheme] = useTheme()
  const isDark = theme === 'dark'
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Dark mode"
      title={label}
      onClick={toggleTheme}
      className={`
        relative inline-flex items-center shrink-0
        w-14 h-7 rounded-full
        border transition-colors duration-200 motion-reduce:transition-none
        focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2
        focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900
        ${isDark
          ? 'bg-indigo-500 border-indigo-400'
          : 'bg-gray-200 border-gray-300 hover:bg-gray-300'}
      `}
    >
      {/* Knob — slides right in dark mode */}
      <span
        className={`
          absolute top-0.5 left-0.5
          flex items-center justify-center
          w-6 h-6 rounded-full bg-white shadow
          transition-transform duration-200 motion-reduce:transition-none
          ${isDark ? 'translate-x-7' : 'translate-x-0'}
        `}
      >
        {isDark
          ? <Moon size={14} className="text-indigo-600" />
          : <Sun size={14} className="text-amber-500" />}
      </span>
    </button>
  )
}
