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
    <div className="flex gap-1 border border-gray-200 dark:border-gray-800 rounded-md p-0.5 w-fit max-w-full overflow-x-auto bg-white dark:bg-gray-900">
      {TABS.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onTabChange(tab.value)}
          className={`px-3 py-1 rounded text-sm font-medium whitespace-nowrap shrink-0 transition-all ${
            activeTab === tab.value
              ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}