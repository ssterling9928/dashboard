import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

import TabBar from '../components/TabBar'
import HostStatRow from '../components/HostStatRow'
import ServicesTab from '../components/ServicesTab'
import PackagesTab from '../components/PackagesTab'
import MonitoringTab from '../components/MonitoringTab'
import LogsTab from '../components/LogsTab'
import ServiceDetailModal from '../components/ServiceDetailModal'
import PackageDetailModal from '../components/PackageDetailModal'
import SystemStatusCard from '../components/SystemStatusCard'
import AlertsCard from '../components/AlertsCard'
import QuickLinksCard from '../components/QuickLinksCard'
import ThemeToggle from '../components/ThemeToggle'

import { useServices } from '../hooks/useServices'
import { usePackages } from '../hooks/usePackages'
import { useStatus } from '../hooks/useStatus'

type Tab = 'services' | 'packages' | 'monitoring' | 'logs'

export default function Dashboard() {
  const [activeTab, setActiveTab]         = useState<Tab>('services')
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null)
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null)

  const { data: services,  isLoading: servicesLoading  } = useServices()
  const { data: packages,  isLoading: packagesLoading  } = usePackages()
  const { data: status,    isError:   statusError      } = useStatus()

  const now = new Date().toLocaleTimeString()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* ── Top Header ── */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Homelab Monitoring</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500">For monitoring my infrastructure and services</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-400 dark:text-gray-500">
          <span className="hidden sm:inline">Last updated: {now}</span>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <ThemeToggle />
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 sm:py-6 space-y-6">

        {/* ── Stat Cards: one row per host ── */}
        <HostStatRow host="synology" />
        <HostStatRow host="titan" />

        {/* ── Main Content + Sidebar (sidebar drops below on smaller screens) ── */}
        <div className="flex flex-col lg:flex-row gap-6">

          {/* ── Left: Tabs + Panel ── */}
          <div className="flex-1 min-w-0">
            <div className="mb-4">
              <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
            </div>

            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              {activeTab === 'services' && (
                servicesLoading
                  ? <p className="text-sm text-gray-400 dark:text-gray-500">Loading services...</p>
                  : <ServicesTab
                      services={services ?? []}
                      onSelectService={setSelectedServiceId}
                    />
              )}
              {activeTab === 'packages' && (
                packagesLoading
                  ? <p className="text-sm text-gray-400 dark:text-gray-500">Loading packages...</p>
                  : <PackagesTab
                      packages={packages ?? []}
                      onSelectPackage={setSelectedPackageId}
                    />
              )}
              {activeTab === 'monitoring' && (
                <MonitoringTab
                  cpu={{     label: 'CPU Usage',     type: 'cpu' }}
                  disk={{    label: 'Disk Usage',    type: 'disk' }}
                  network={{ label: 'Network Usage', type: 'network' }}
                />
              )}
              {activeTab === 'logs' && (
                <LogsTab grafanaUrl={import.meta.env.VITE_GRAFANA_URL} />
              )}
            </div>
          </div>

          {/* ── Right: Sidebar ── */}
          <div className="grid gap-4 items-start content-start md:grid-cols-3 lg:grid-cols-1 lg:w-64 lg:shrink-0 lg:self-start">

            <SystemStatusCard status={status} isError={statusError} />
            <AlertsCard alerts={status?.alerts} />
            <QuickLinksCard />

          </div>
        </div>
      </div>

      {/* ── Service Detail Modal ── */}
      {selectedServiceId && (
        <ServiceDetailModal
          serviceId={selectedServiceId}
          onClose={() => setSelectedServiceId(null)}
        />
      )}

      {/* ── Package Detail Modal ── */}
      {selectedPackageId && (
        <PackageDetailModal
          packageId={selectedPackageId}
          onClose={() => setSelectedPackageId(null)}
        />
      )}
    </div>
  )
}