// QuickLinksCard Component
// Links from config/quickLinks.ts, opened in a new tab

import { ExternalLink } from 'lucide-react'
import { QUICK_LINKS } from '../config/quickLinks'

export default function QuickLinksCard() {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Quick Links</h3>
      <div className="space-y-2">
        {QUICK_LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            {link.label}
            <ExternalLink size={12} className="text-gray-300 dark:text-gray-600 shrink-0" />
          </a>
        ))}
      </div>
    </div>
  )
}
