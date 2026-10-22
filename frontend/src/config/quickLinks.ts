// Quick Links shown in the dashboard sidebar.
// Edit this list to add, remove or reorder links; they open in a new tab.

export interface QuickLink {
  label: string
  href:  string
}

export const QUICK_LINKS: QuickLink[] = [
  { label: 'Vault DSM',            href: 'https://dsm.home.sterling-dev.com' },
  { label: 'Portainer',            href: 'https://portainer.home.sterling-dev.com' },
  { label: 'Grafana',              href: 'https://grafana.home.sterling-dev.com' },
  { label: 'Nginx Proxy Manager',  href: 'https://npm.home.sterling-dev.com' },
  { label: 'Code Server',          href: 'https://code.home.sterling-dev.com' },
  { label: 'Surveillance Station', href: 'https://nvr.home.sterling-dev.com' },
  { label: 'Plex',                 href: 'https://plex.home.sterling-dev.com' },
]
