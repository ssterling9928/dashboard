// Quick Links shown in the dashboard sidebar; they open in a new tab.
// Set at build time in frontend/.env (dev) or the compose .env (Docker):
//
//   VITE_QUICK_LINKS="Grafana|https://grafana.example.com,Portainer|https://portainer.example.com"
//
// Entries are "Label|URL", separated by commas. Without any, the card is hidden.

export interface QuickLink {
  label: string
  href:  string
}

// Only http(s) links are kept, so a bad entry can't become a javascript: link
export function parseQuickLinks(raw: string | undefined): QuickLink[] {
  return (raw ?? '')
    .split(',')
    .map(entry => entry.split('|').map(s => s.trim()))
    .filter((parts): parts is [string, string] => parts.length === 2 && !!parts[0] && !!parts[1])
    .filter(([, href]) => {
      try {
        return ['http:', 'https:'].includes(new URL(href).protocol)
      } catch {
        return false
      }
    })
    .map(([label, href]) => ({ label, href }))
}

export const QUICK_LINKS = parseQuickLinks(import.meta.env.VITE_QUICK_LINKS)
