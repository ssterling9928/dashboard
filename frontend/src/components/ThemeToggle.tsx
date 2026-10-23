// ThemeToggle Component
// Header button that switches between light and dark mode

import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

export default function ThemeToggle() {
  const [theme, toggleTheme] = useTheme()
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button
      onClick={toggleTheme}
      className="hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      aria-label={label}
      title={label}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
