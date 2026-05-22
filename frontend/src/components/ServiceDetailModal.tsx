// src/components/ServiceDetailsModal.tsx
import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ServiceDetail } from '@shared/types'
import { fetchService, containerAction } from '../api/Services'
import HealthBadge from './HealthBadge'
import dockerIcon from '../assets/docker.svg'

interface Props {
  serviceId: string | null
  onClose:   () => void
}

function DetailRow({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-gray-500">{label}:</span>
      <span className="text-gray-800 font-medium text-right max-w-[60%] truncate">
        {value ?? '—'}
      </span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <h3 className="text-base font-bold text-gray-900 mb-2">{title}</h3>
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
    green: 'border-green-400 text-green-600 hover:bg-green-50',
    red:   'border-red-400 text-red-500 hover:bg-red-50',
    gray:  'border-gray-400 text-gray-600 hover:bg-gray-50',
  }

  const cls = `px-4 py-1 rounded-full border text-xs font-semibold transition-colors ${styles[variant]}`

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}:</span>
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
        <div className="w-12 h-12 rounded-full bg-gray-200" />
        <div className="flex flex-col gap-2">
          <div className="h-5 w-40 bg-gray-200 rounded" />
          <div className="h-3 w-24 bg-gray-100 rounded" />
          <div className="h-3 w-32 bg-gray-100 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="h-4 w-24 bg-gray-200 rounded" />
            {[...Array(4)].map((_, j) => (
              <div key={j} className="h-3 w-full bg-gray-100 rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ServiceDetailsModal({ serviceId, onClose }: Props) {
  const queryClient = useQueryClient()

  const { data: service, isLoading, isError } = useQuery<ServiceDetail>({
    queryKey:  ['service', serviceId],
    queryFn:   () => fetchService(serviceId!),
    enabled:   !!serviceId,
    staleTime: 0,
  })

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
    queryClient.invalidateQueries({ queryKey: ['service', serviceId] })
    queryClient.invalidateQueries({ queryKey: ['services'] })
  }

  const grafanaUrl = service
    ? `${import.meta.env.VITE_GRAFANA_URL}/explore?left={"queries":[{"expr":"{container_name=\\"${service.containerName}\\"}"}]}`
    : '#'

  const appUrl = service?.ports?.length
    ? `http://${window.location.hostname}:${service.ports[0]?.split(':')[0]}`
    : '#'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {isLoading && <SkeletonModal />}

        {isError && (
          <div className="p-6 text-sm text-red-500">
            Failed to load container details. Is the backend running?
          </div>
        )}

        {service && (
          <>
            {/* ── Header ───────────────────────────────── */}
            <div className="flex items-start justify-between p-6 border-b border-gray-100">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                  <img src={dockerIcon} alt={service.name} className="w-7 h-7" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-gray-900">{service.name}</h2>
                    <HealthBadge status={service.status} />
                  </div>
                  <span className="text-sm text-gray-500">{service.version}</span>
                  <span className="text-sm text-gray-400">{service.description}</span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors text-2xl font-bold leading-none mt-1"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* ── Body ─────────────────────────────────── */}
            <div className="p-6 grid grid-cols-2 gap-8">

              {/* Overview */}
              <Section title="Overview">
                <DetailRow label="Container Name" value={service.containerName} />
                <DetailRow label="Status"         value={service.status} />
                <DetailRow label="Health"         value={service.status} />
                <DetailRow label="Image"          value={service.image} />
                <DetailRow label="Container ID"   value={service.containerId?.slice(0, 12)} />
              </Section>

              {/* Network */}
              <Section title="Network">
                <DetailRow label="Public Hostname" value={window.location.hostname} />
                <DetailRow label="Internal IP"     value={service.internalIp} />
                <DetailRow label="Ports"           value={service.ports?.join(', ') || 'None'} />
                <DetailRow label="URL"             value={appUrl !== '#' ? appUrl : '—'} />
              </Section>

              {/* Runtime */}
              <Section title="Runtime">
                <DetailRow label="Started"        value={service.started} />
                <DetailRow label="Uptime"         value={service.uptime} />
                <DetailRow label="Restart Count"  value={service.restarts} />
                <DetailRow label="Restart Policy" value={service.restartPolicy} />
              </Section>

              {/* Tools */}
              <Section title="Tools">
                <div className="flex flex-col gap-2.5 mt-1">
                  <ToolButton
                    label="Open App"
                    buttonText="Open"
                    href={appUrl}
                    variant="green"
                  />
                  <ToolButton
                    label="Check Logs"
                    buttonText="Logs"
                    href={grafanaUrl}
                    variant="green"
                  />
                  <ToolButton
                    label="Restart Container"
                    buttonText="Restart"
                    onClick={() => handleAction('restart')}
                    variant="red"
                  />
                  <ToolButton
                    label="Inspect Container"
                    buttonText="Inspect"
                    href={`/api/services/${service.id}/inspect`}
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