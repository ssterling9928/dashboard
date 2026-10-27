
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useServiceDetail, containerAction } from '../hooks/useServices'
import HealthBadge from './HealthBadge'
import HostBadge from './HostBadge'
import dockerIcon from '../assets/docker.png'
import { API } from '../config/api'

interface Props {
  serviceId: string | null
  onClose:   () => void
}

function DetailRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-gray-500 dark:text-gray-400">{label}:</span>
      <span className="text-gray-800 dark:text-gray-200 font-medium text-right max-w-[60%] truncate">
        {value ?? '—'}
      </span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
      {children}
    </div>
  )
}

function ToolButton({
  label,
  buttonText,
  href,
  onClick,
  variant = 'gray',
}: {
  label:      string
  buttonText: string
  href?:      string
  onClick?:   () => void
  variant?:   'green' | 'red' | 'gray'
}) {
  const styles = {
    green: 'border-green-400 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950',
    red:   'border-red-400 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950',
    gray:  'border-gray-400 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800',
  }

  const cls = `px-4 py-1 rounded-full border text-xs font-semibold transition-colors ${styles[variant]}`

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500 dark:text-gray-400">{label}:</span>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
          {buttonText}
        </a>
      ) : (
        <button onClick={onClick} className={cls}>
          {buttonText}
        </button>
      )}
    </div>
  )
}

function SkeletonModal() {
  return (
    <div className="p-6 animate-pulse flex flex-col gap-6">
      <div className="flex gap-3 items-center">
        <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="flex flex-col gap-2">
          <div className="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-3 w-24 bg-gray-100 dark:bg-gray-800 rounded" />
          <div className="h-3 w-32 bg-gray-100 dark:bg-gray-800 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
            {[...Array(4)].map((_, j) => (
              <div key={j} className="h-3 w-full bg-gray-100 dark:bg-gray-800 rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ServiceDetailsModal({ serviceId, onClose }: Props) {
  const queryClient = useQueryClient()

  const { data: service, isLoading, isError } = useServiceDetail(serviceId)

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  if (!serviceId) return null

  async function handleAction(action: 'start' | 'stop' | 'restart') {
    if (!serviceId) return
    await containerAction(serviceId, action)
    queryClient.invalidateQueries({ queryKey: ['services', serviceId] })
    queryClient.invalidateQueries({ queryKey: ['services'] })
  }

  // Set at build time; without it there's nowhere to send the Logs button
  const grafanaBase = import.meta.env.VITE_GRAFANA_URL
  const grafanaUrl = service && grafanaBase
    ? `${grafanaBase}/explore?left={"queries":[{"expr":"{container_name=\\"${service.Name}\\"}"}]}`
    : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {isLoading && <SkeletonModal />}

        {isError && (
          <div className="p-6 text-sm text-red-500 dark:text-red-400">
            Failed to load container details. Is the backend running?
          </div>
        )}

        {service && (
          <>
            {/* ── Header ───────────────────────────────── */}
            <div className="flex items-start justify-between gap-3 p-4 sm:p-6 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                  <img src={dockerIcon} alt={service.Name} className="w-7 h-7" />
                </div>
                <div className="flex flex-col">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{service.Name}</h2>
                    <HealthBadge status={service.Status} />
                    <HostBadge host={service.Host} />
                  </div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{service.Version}</span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-200 transition-colors text-2xl font-bold leading-none mt-1"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* ── Body ─────────────────────────────────── */}
            <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">

              {/* Overview */}
              <Section title="Overview">
                <DetailRow label="Container Name" value={service.Name} />
                <DetailRow label="Status"         value={service.Status} />
                <DetailRow label="Image"          value={service.ImageId} />
                <DetailRow label="Container ID"   value={service.ContainerId.slice(0, 12)} />
              </Section>

              {/* Network */}
              <Section title="Network">
                {service.Url && <DetailRow label="URL" value={service.Url} />}
                <DetailRow label="Ports" value={service.Ports?.join(', ') || 'None'} />
              </Section>

              {/* Runtime */}
              <Section title="Runtime">
                <DetailRow label="Started"        value={service.Started} />
                <DetailRow label="Uptime"         value={service.Uptime} />
                <DetailRow label="Restart Count"  value={service.Restarts} />
                <DetailRow label="Restart Policy" value={service.RestartPolicy} />
              </Section>

              {/* Tools */}
              <Section title="Tools">
                <div className="flex flex-col gap-2.5 mt-1">
                  {service.Url && (
                    <ToolButton
                      label="Open App"
                      buttonText="Open"
                      href={service.Url}
                      variant="green"
                    />
                  )}
                  {grafanaUrl && (
                    <ToolButton
                      label="Check Logs"
                      buttonText="Logs"
                      href={grafanaUrl}
                      variant="green"
                    />
                  )}
                  <ToolButton
                    label="Restart Container"
                    buttonText="Restart"
                    onClick={() => handleAction('restart')}
                    variant="red"
                  />
                  <ToolButton
                    label="Inspect Container"
                    buttonText="Inspect"
                    href={`${API}/api/services/${service.ServiceId}/inspect`}
                    variant="gray"
                  />
                </div>
              </Section>

            </div>
          </>
        )}
      </div>
    </div>
  )
}