
import HealthBadge from './HealthBadge'
import HostBadge from './HostBadge'
import type { Service } from '@shared/types'
import dockerIcon from '../assets/docker.png'

interface Props {
  service:   Service
  onDetails: (service: Service) => void
}

export default function ServiceCard({ service, onDetails }: Props) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-5 flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0">

          {/* Icon */}
          <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
            <img
              src={dockerIcon}
              alt={service.Name}
              className="w-7 h-7"
            />
          </div>

          {/* Text */}
          <div className="flex flex-col min-w-0">
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight truncate" title={service.Name}>
              {service.Name}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {service.Version}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <HealthBadge status={service.Status} />
          <HostBadge host={service.Host} />
        </div>
      </div>

      {/* Detail Rows */}
      <div className="flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
        <div className="flex justify-between py-2 text-sm">
          <span className="text-gray-500 dark:text-gray-400 font-medium">Status</span>
          <span className="text-gray-800 dark:text-gray-200 font-semibold capitalize">{service.Status}</span>
        </div>
        <div className="flex justify-between py-2 text-sm">
          <span className="text-gray-500 dark:text-gray-400 font-medium">Uptime</span>
          <span className="text-gray-800 dark:text-gray-200 font-semibold">{service.Uptime}</span>
        </div>
      </div>

      {/* Footer */}
      <div>
        <button
          onClick={() => onDetails(service)}
          className="px-4 py-1.5 rounded-full border border-gray-400 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Details
        </button>
      </div>

    </div>
  )
}