import { proxyMap } from '@/assembly/proxies/state'
import {
  autoDetectDetourByName,
  proxyDetourList,
  showDetourInnerConnections,
} from '@/store/settings'
import { activeBackend } from '@/store/setup'
import type { Connection } from '@/types'
import {
  deriveDetourInnerConnectionsForConnection,
  expandConnectionsWithDetourInner,
  resolveEffectiveDialerProxy,
} from './detour-chain-core'

export {
  deriveDetourInnerConnectionsForConnection,
  detectAutoDetourPairs,
  expandConnectionsWithDetourInner,
  getRealConnectionId,
  INNER_DETOUR_ID_PREFIX,
  isDerivedDetourConnectionId,
  resolveConfiguredProxyDetour,
  resolveDetourProxyChains,
  resolveEffectiveDialerProxy,
} from './detour-chain-core'

export const getEffectiveDialerProxy = (proxyName: string) =>
  resolveEffectiveDialerProxy(
    proxyName,
    proxyMap.value,
    proxyDetourList.value,
    activeBackend.value?.uuid,
    autoDetectDetourByName.value,
  )

export const getConnectionDetourChainGroups = (conn: Connection): string[] => {
  const derived = deriveDetourInnerConnectionsForConnection(
    conn,
    proxyMap.value,
    proxyDetourList.value,
    activeBackend.value?.uuid,
    autoDetectDetourByName.value,
  )

  return derived.flatMap((item) => ('daeRaw' in item ? [] : item.chains))
}

export const withDetourInnerConnections = (items: readonly Connection[]) =>
  expandConnectionsWithDetourInner(
    items,
    proxyMap.value,
    proxyDetourList.value,
    activeBackend.value?.uuid,
    autoDetectDetourByName.value,
    showDetourInnerConnections.value,
  )
