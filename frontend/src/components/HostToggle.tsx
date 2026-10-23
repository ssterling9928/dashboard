// HostToggle Component
// Segmented Vault / titan switch used by the Monitoring and Logs tabs

import type { Host } from '@shared/types'

interface Props {
  value:    Host
  onChange: (host: Host) => void
}

const OPTIONS: { label: string; value: Host }[] = [
  { label: 'Vault', value: 'synology' },
  { label: 'Titan', value: 'titan'    },
]

export default function HostToggle({ value, onChange }: Props) {
  return (
    <div className="flex gap-1 border border-gray-200 dark:border-gray-800 rounded-md p-0.5 w-fit bg-white dark:bg-gray-900">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`px-3 py-1 rounded text-sm font-medium transition-all ${
            value === option.value
              ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
