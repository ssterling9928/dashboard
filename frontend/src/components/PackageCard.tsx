
import type { Package } from '@shared/types'

interface Props {
  pkg: Package
  onDetails: () => void
}

const statusStyles: Record<string, { dot: string; label: string }> = {
  running: { dot: 'bg-green-400',  label: 'Running'  },
  stopped: { dot: 'bg-gray-300',   label: 'Stopped'  },
  error:   { dot: 'bg-red-400',    label: 'Error'    },
}

export default function PackageCard({ pkg, onDetails }: Props) {
  const status = statusStyles[pkg.status.toLowerCase()] ?? {
    dot: 'bg-gray-300',
    label: pkg.status,
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <span className="text-blue-600 text-xs font-bold">
              {pkg.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight">{pkg.name}</p>
            <p className="text-xs text-gray-400">{pkg.version}</p>
          </div>
        </div>
        <span className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
          pkg.status.toLowerCase() === 'running'
            ? 'bg-green-100 text-green-700'
            : 'bg-gray-100 text-gray-500'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
          {status.label}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-500 line-clamp-2">{pkg.description}</p>

      {/* Info rows */}
      <div className="flex flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Status</span>
          <span className="text-gray-700 font-medium">{status.label}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Type</span>
          <span className="text-gray-700 font-medium capitalize">{pkg.type}</span>
        </div>
      </div>

      {/* Details button */}
      <button
        onClick={onDetails}
        className="mt-auto self-start text-xs border border-gray-300 rounded-full px-3 py-1 text-gray-600 hover:bg-gray-50 transition-colors"
      >
        Details
      </button>
    </div>
  )
}