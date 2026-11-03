import { describe, expect, it } from 'vitest'
import { parseQuickLinks } from './quickLinks'

describe('parseQuickLinks', () => {
  it('reads "Label|URL" entries in order', () => {
    expect(parseQuickLinks(' Grafana | https://grafana.example.com ,Portainer|https://portainer.example.com')).toEqual([
      { label: 'Grafana',   href: 'https://grafana.example.com' },
      { label: 'Portainer', href: 'https://portainer.example.com' },
    ])
  })

  it('is empty when unset', () => {
    expect(parseQuickLinks(undefined)).toEqual([])
    expect(parseQuickLinks('')).toEqual([])
  })

  it('drops malformed entries and anything that is not http(s)', () => {
    expect(parseQuickLinks('NoUrl,|https://x.example.com,Bad|not a url,JS|javascript:alert(1),Ok|http://ok.example.com')).toEqual([
      { label: 'Ok', href: 'http://ok.example.com' },
    ])
  })
})
