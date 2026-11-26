import type { Proxy, ProxyProvider } from '../types'

type ProxyDisplayNode = Pick<Proxy, 'all' | 'provider-name'>
type ProxyDisplayProvider = Pick<ProxyProvider, 'name' | 'proxies'>

const stripLeadingProviderPrefix = (name: string, providerName: string) => {
  if (!providerName) return ''

  const prefix = `${providerName}/`
  if (name.startsWith(prefix) && name.length > prefix.length) {
    return name.slice(prefix.length)
  }

  return ''
}

export const formatProxyDisplayName = (
  name: string,
  proxies: Record<string, ProxyDisplayNode>,
  providers: readonly ProxyDisplayProvider[],
): string => {
  if (!name || !name.includes('/')) {
    return name
  }

  const node = proxies[name]
  if (node?.all?.length) {
    return name
  }

  const hinted = node?.['provider-name']
  if (hinted) {
    const stripped = stripLeadingProviderPrefix(name, hinted)
    if (stripped) {
      return stripped
    }
  }

  for (const provider of providers) {
    if (provider.proxies.some((proxy) => proxy.name === name)) {
      const stripped = stripLeadingProviderPrefix(name, provider.name)
      if (stripped) {
        return stripped
      }
    }
  }

  let matchedProvider = ''
  for (const provider of providers) {
    if (
      provider.name.length > matchedProvider.length &&
      stripLeadingProviderPrefix(name, provider.name)
    ) {
      matchedProvider = provider.name
    }
  }

  return matchedProvider ? name.slice(matchedProvider.length + 1) : name
}
