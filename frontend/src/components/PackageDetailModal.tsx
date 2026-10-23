
import { useEffect } from 'react'
import { usePackageDetail } from '../hooks/usePackages'
import HealthBadge from './HealthBadge'

interface Props {
  packageId: string | null
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

function SkeletonModal() {
  return (
    <div className="p-6 animate-pulse flex flex-col gap-6">
      <div className="flex gap-3 items-center">
        <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="flex flex-col gap-2">
          <div className="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-3 w-24 bg-gray-100 dark:bg-gray-800 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-8">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
            {[...Array(3)].map((_, j) => (
              <div key={j} className="h-3 w-full bg-gray-100 dark:bg-gray-800 rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PackageDetailModal({ packageId, onClose }: Props) {
  const { data: pkg, isLoading, isError } = usePackageDetail(packageId)

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

  if (!packageId) return null

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
            Failed to load package details. Is the backend running?
          </div>
        )}

        {pkg && (
          <>
            {/* ── Header ───────────────────────────────── */}
            <div className="flex items-start justify-between gap-3 p-4 sm:p-6 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                  <span className="text-blue-600 dark:text-blue-300 text-lg font-bold">
                    {pkg.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex flex-col">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{pkg.name}</h2>
                    <HealthBadge status={pkg.status} />
                  </div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{pkg.version}</span>
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
                <DetailRow label="Package ID" value={pkg.id} />
                <DetailRow label="Version"    value={pkg.version} />
                <DetailRow label="Type"       value={pkg.type} />
                <DetailRow label="Status"     value={pkg.status} />
              </Section>

              {/* Details */}
              <Section title="Details">
                <DetailRow label="Install Path" value={pkg.installPath} />
                <DetailRow label="Size"         value={pkg.size} />
              </Section>

              {/* Description */}
              {pkg.description && (
                <div className="col-span-2 flex flex-col">
                  <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2">Description</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{pkg.description}</p>
                </div>
              )}

            </div>
          </>
        )}
      </div>
    </div>
  )
}
