import { proxyMap, proxyProviederList } from '@/assembly/proxies/state'
import { formatProxyDisplayName } from './proxy-display-core'

export { formatProxyDisplayName } from './proxy-display-core'

export const getDisplayProxyName = (name: string) =>
  formatProxyDisplayName(name, proxyMap.value, proxyProviederList.value)
