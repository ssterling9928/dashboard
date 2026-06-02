import { useState } from 'react'
import { Cpu, MemoryStick, HardDrive, Network, RefreshCw, Settings } from 'lucide-react'

import TabBar from '../components/TabBar'
import StatCard from '../components/StatCard'
import ServicesTab from '../components/ServicesTab'
import PackagesTab from '../components/PackagesTab'
import MonitoringTab from '../components/MonitoringTab'
import LogsTab from '../components/LogsTab'
import ServiceDetailModal from '../components/ServiceDetailModal'

import { useServices, useServiceDetail } from '../hooks/useServices'
import { usePackages } from '../hooks/usePackages'
import { useMetrics } from '../hooks/useMetrics'
import { useLogs } from '../hooks/useLogs'

type Tab = 'services' | 'packages' | 'monitoring' | 'logs'

// ── Static sidebar data ───────────────────────────────────
const QUICK_LINKS = [
  { label: 'Server Management', href: '#' },
  { label: 'Database Console',  href: '#' },
  { label: 'Cloud Dashboard',   href: '#' },
  { label: 'Analytics Portal',  href: '#' },
  { label: 'User Management',   href: '#' },
  { label: 'System Settings',   href: '#' },
]

const ALERTS = [
  { type: 'warning', message: 'High cache memory usage', sub: 'Consider scaling Redis instance' },
  { type: 'success', message: 'Backup completed',        sub: 'Daily backup finished at 2:00 AM' },
]

export default function Dashboard() {
  const [activeTab, setActiveTab]         = useState<Tab>('services')
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null)

  const { data: services,  isLoading: servicesLoading  } = useServices()
  const { data: packages,  isLoading: packagesLoading  } = usePackages()
  const { data: metrics,   isLoading: metricsLoading   } = useMetrics()
  const { data: logs,      isLoading: logsLoading      } = useLogs()
  const { data: serviceDetail }                           = useServiceDetail(selectedServiceId)

  const now = new Date().toLocaleTimeString()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top Header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard HomePage</h1>
          <p className="text-xs text-gray-400">For monitoring my infrastructure and services</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <span>Last updated: {now}</span>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1 hover:text-gray-700 transition-colors"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="hover:text-gray-700 transition-colors">
            <Settings size={16} />
          </button>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6">

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label="CPU Usage"
            value={metrics ? `${metrics.cpu.current}${metrics.cpu.unit}` : '—'}
            note={metricsLoading ? 'Loading...' : '8 cores / 16 threads'}
            icon={<Cpu size={16} />}
            percent={metrics?.cpu.current}
          />
          <StatCard
            label="Memory"
            value={metrics ? `${metrics.memory.current}${metrics.memory.unit}` : '—'}
            subValue={metrics ? `/ ${metrics.memory.peak}${metrics.memory.unit}` : undefined}
            note={metricsLoading ? 'Loading...' : `${metrics?.memory.average}% utilized`}
            icon={<MemoryStick size={16} />}
            percent={metrics?.memory.current}
          />
          <StatCard
            label="Storage"
            value={metrics ? `${metrics.storage.current}${metrics.storage.unit}` : '—'}
            subValue={metrics ? `/ ${metrics.storage.peak}${metrics.storage.unit}` : undefined}
            note={metricsLoading ? 'Loading...' : 'Available space'}
            icon={<HardDrive size={16} />}
            percent={metrics?.storage.current}
          />
          <StatCard
            label="Network"
            value={metrics ? `${metrics.network.current}${metrics.network.unit}` : '—'}
            note={metricsLoading ? 'Loading...' : 'Bandwidth: 1 Gbps'}
            icon={<Network size={16} />}
          />
        </div>

        {/* ── Main Content + Sidebar ── */}
        <div className="flex gap-6">

          {/* ── Left: Tabs + Panel ── */}
          <div className="flex-1 min-w-0">
            <div className="mb-4">
              <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              {activeTab === 'services' && (
                servicesLoading
                  ? <p className="text-sm text-gray-400">Loading services...</p>
                  : <ServicesTab
                      services={services ?? []}
                      onSelectService={setSelectedServiceId}
                    />
              )}
              {activeTab === 'packages' && (
                packagesLoading
                  ? <p className="text-sm text-gray-400">Loading packages...</p>
                  : <PackagesTab
                      packages={packages ?? []}
                      onSelectPackage={(id) => console.log('package selected:', id)}
                    />
              )}
              {activeTab === 'monitoring' && (
                metricsLoading || !metrics
                  ? <p className="text-sm text-gray-400">Loading metrics...</p>
                  : <MonitoringTab
                      cpu={{
                        label:    'CPU Usage',
                        subtitle: 'Last 24 Hours',
                        data:     metrics.cpu,
                      }}
                      disk={{
                        label:    'Disk Usage',
                        subtitle: 'Last 24 Hours',
                        data:     metrics.storage,
                      }}
                      network={{
                        label:    'Network Usage',
                        subtitle: 'Last 24 Hours',
                        data:     metrics.network,
                      }}
                    />
              )}
              {activeTab === 'logs' && (
                logsLoading
                  ? <p className="text-sm text-gray-400">Loading logs...</p>
                  : <LogsTab
                      logs={logs ?? []}
                      grafanaUrl="http://localhost:3000"
                    />
              )}
            </div>
          </div>

          {/* ── Right: Sidebar ── */}
          <div className="w-64 shrink-0 space-y-4">

            {/* System Status */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">System Status</h3>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-sm text-green-600 font-medium">All Systems Operational</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Uptime</span>
                  <span className="text-gray-700 font-medium">45d 12h 34m</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Load Average</span>
                  <span className="text-gray-700 font-medium">2.4, 2.1, 1.8</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Active Connections</span>
                  <span className="text-gray-700 font-medium">1,247</span>
                </div>
              </div>
            </div>

            {/* Alerts */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Alerts</h3>
              <div className="space-y-3">
                {ALERTS.map((alert, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                      alert.type === 'warning' ? 'bg-yellow-400' : 'bg-green-400'
                    }`} />
                    <div>
                      <p className="text-sm text-gray-800 font-medium">{alert.message}</p>
                      <p className="text-xs text-gray-400">{alert.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Links */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Links</h3>
              <div className="space-y-2">
                {QUICK_LINKS.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Service Detail Modal ── */}
      {selectedServiceId && serviceDetail && (
        <ServiceDetailModal
          serviceId={serviceDetail.id}
          onClose={() => setSelectedServiceId(null)}
        />
      )}
    </div>
  )
}