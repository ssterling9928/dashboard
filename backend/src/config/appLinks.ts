// Containers that have a web app, and where it's served. Set in backend.env:
//
//   APP_DOMAIN=home.example.com
//   APP_LINKS=grafana,portainer,it-tools=tools,vs-code-editor=code
//
// Each APP_LINKS entry is a container name, followed by "=subdomain" when the
// subdomain differs from the name. Containers not listed (exporters, proxies,
// backends, agents) have no app, so the container popup hides "Open App" for
// them. Without APP_DOMAIN, no container gets a link.

export interface AppLinks {
  domain:     string
  subdomains: Map<string, string>
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/
const HOSTNAME_PART = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/

// Malformed entries are skipped (and logged), so a typo can't produce a
// link to somewhere unexpected
export function parseAppLinks(domain: string, list: string): AppLinks {
  const cleanDomain = domain.trim().toLowerCase()
  const subdomains = new Map<string, string>()

  if (cleanDomain && !HOSTNAME_PART.test(cleanDomain)) {
    console.warn(`APP_DOMAIN is not a valid domain, so no container gets a link: ${domain}`)
    return { domain: '', subdomains }
  }

  for (const entry of list.split(',').map(e => e.trim()).filter(Boolean)) {
    const [name = '', sub = name] = entry.split('=').map(s => s.trim())
    const subdomain = sub.toLowerCase()
    if (!NAME.test(name) || !HOSTNAME_PART.test(subdomain)) {
      console.warn(`Ignoring APP_LINKS entry: ${entry}`)
      continue
    }
    subdomains.set(name, subdomain)
  }

  return { domain: cleanDomain, subdomains }
}

export const APP_LINKS = parseAppLinks(process.env.APP_DOMAIN ?? '', process.env.APP_LINKS ?? '')
