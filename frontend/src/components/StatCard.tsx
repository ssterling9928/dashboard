
import type { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: string
  subValue?: string
  note?: string
  icon: ReactNode
  percent?: number
}

export default function StatCard({ label, value, subValue, note, icon, percent }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between text-gray-400 dark:text-gray-500">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <span className="w-4 h-4">{icon}</span>
      </div>
      <div>
        <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{value}</span>
        {subValue && <span className="text-sm text-gray-400 dark:text-gray-500 ml-1">{subValue}</span>}
      </div>
      {percent !== undefined && (
        <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gray-900 dark:bg-gray-100 rounded-full"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      {note && <p className="text-xs text-gray-400 dark:text-gray-500">{note}</p>}
    </div>
  )
}