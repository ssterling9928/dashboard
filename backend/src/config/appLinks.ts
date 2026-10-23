// Containers that have a web app, and the subdomain it's served on under
// home.sterling-dev.com. Containers not listed here (exporters, proxies,
// backends, agents) have no app — the container popup hides "Open App" for them.
// Edit this list when adding or renaming a container.

export const APP_DOMAIN = 'home.sterling-dev.com'

export const APP_SUBDOMAINS: Record<string, string> = {
  // Subdomain matches the container name
  'alloy':                   'alloy',
  'grafana':                 'grafana',
  'nexterm':                 'nexterm',
  'npm':                     'npm',
  'peanut':                  'peanut',
  'portainer':               'portainer',
  'prometheus':              'prometheus',
  'prowlarr':                'prowlarr',
  'qbittorrent':             'qbittorrent',
  'radarr':                  'radarr',
  'sonarr':                  'sonarr',
  'termix':                  'termix',

  // Subdomain differs from the container name
  'it-tools':                'tools',
  'service-status-frontend': 'docker',
  'vs-code-editor':          'code',
}
