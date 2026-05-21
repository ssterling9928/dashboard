// src/components/ServiceCard.tsx
import HealthBadge from './HealthBadge'
import type { Service } from '../../../shared/types'
import dockerIcon from '../assets/docker.svg'
import appIcon    from '../assets/app.svg'

interface Props {
  service:   Service
  onDetails: (service: Service) => void
}

export default function ServiceCard({ service, onDetails }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">

          {/* Icon */}
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
            <img
              src={dockerIcon}
              alt={service.name}
              className="w-7 h-7"
            />
          </div>

          {/* Text */}
          <div className="flex flex-col">
            <span className="text-lg font-bold text-gray-900 leading-tight">
              {service.name}
            </span>
            <span className="text-sm text-gray-500">
              {service.version}
            </span>
            <span className="text-sm text-gray-400">
              {service.description}
            </span>
          </div>
        </div>

        <HealthBadge status={service.status} />
      </div>

      {/* Detail Rows */}
      <div className="flex flex-col divide-y divide-gray-100">
        <div className="flex justify-between py-2 text-sm">
          <span className="text-gray-500 font-medium">Status</span>
          <span className="text-gray-800 font-semibold capitalize">{service.status}</span>
        </div>
        <div className="flex justify-between py-2 text-sm">
          <span className="text-gray-500 font-medium">Uptime</span>
          <span className="text-gray-800 font-semibold">{service.uptime}</span>
        </div>
        <div className="flex justify-between py-2 text-sm">
          <span className="text-gray-500 font-medium">Restarts</span>
          <span className="text-gray-800 font-semibold">{service.restarts}</span>
        </div>
      </div>

      {/* Footer */}
      <div>
        <button
          onClick={() => onDetails(service)}
          className="px-4 py-1.5 rounded-full border border-gray-400 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Details
        </button>
      </div>

    </div>
  )
}