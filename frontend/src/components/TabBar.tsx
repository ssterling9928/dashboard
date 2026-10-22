type Tab = 'services' | 'packages' | 'monitoring' | 'logs'

interface TabBarProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}

const TABS: { label: string; value: Tab }[] = [
  { label: 'Containers',        value: 'services'   },
  { label: 'Synology Packages', value: 'packages'   },
  { label: 'Monitoring',        value: 'monitoring' },
  { label: 'Logs',              value: 'logs'       },
]

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="flex gap-1 border border-gray-200 rounded-md p-0.5 w-fit max-w-full overflow-x-auto bg-white">
      {TABS.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onTabChange(tab.value)}
          className={`px-3 py-1 rounded text-sm font-medium whitespace-nowrap shrink-0 transition-all ${
            activeTab === tab.value
              ? 'bg-gray-900 text-white'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}