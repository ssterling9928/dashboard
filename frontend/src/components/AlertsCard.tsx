// AlertsCard Component
// Active alerts from /api/status, most severe first

import type { Alert } from '@shared/types'

interface Props {
  alerts?: Alert[]
}

const SEVERITY_DOT = {
  critical: 'bg-red-500',
  warning:  'bg-yellow-400',
}

export default function AlertsCard({ alerts }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Active Alerts</h3>
        {alerts && alerts.length > 0 && (
          <span className="text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
            {alerts.length}
          </span>
        )}
      </div>

      {!alerts && <p className="text-sm text-gray-400">Loading...</p>}

      {alerts && alerts.length === 0 && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
          <p className="text-sm text-gray-500">No active alerts</p>
        </div>
      )}

      {alerts && alerts.length > 0 && (
        <div className="space-y-3 max-h-72 overflow-y-auto">
          {alerts.map(alert => (
            <div key={alert.id} className="flex items-start gap-2">
              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOT[alert.severity]}`} />
              <div className="min-w-0">
                <p className="text-sm text-gray-800 font-medium">{alert.title}</p>
                <p className="text-xs text-gray-400 break-words">{alert.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
