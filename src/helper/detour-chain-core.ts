import type {
  ClashConnectionRawMessage,
  Connection,
  Proxy,
  ProxyDetourRule,
  ProxyProvider,
} from '../types'

export const INNER_DETOUR_ID_PREFIX = 'detour-inner:'

const MAX_CHAIN_DEPTH = 16

export const isDerivedDetourConnectionId = (id: string) => id.startsWith(INNER_DETOUR_ID_PREFIX)

export const getRealConnectionId = (id: string) => {
  if (!isDerivedDetourConnectionId(id)) {
    return id
  }

  const rest = id.slice(INNER_DETOUR_ID_PREFIX.length)
  const sepIndex = rest.indexOf(':')

  return sepIndex === -1 ? rest : rest.slice(sepIndex + 1)
}

const isRuleInScope = (rule: ProxyDetourRule, backendUuid?: string) => {
  if (!rule.scope?.length) return true
  if (!backendUuid) return false

  return rule.scope.includes(backendUuid)
}

const matchesDetourRule = (match: string, proxyName: string, providerName: string): boolean => {
  const pattern = match.trim()
  if (!pattern) return false

  if (pattern.startsWith('/') && pattern.length > 1) {
    try {
      const regex = new RegExp(pattern.slice(1), 'i')
      return regex.test(proxyName) || (providerName ? regex.test(providerName) : false)
    } catch {
      return false
    }
  }

  if (proxyName === pattern || proxyName.startsWith(pattern)) {
    return true
  }

  if (providerName && providerName === pattern) {
    return true
  }

  if (!pattern.endsWith('/') && proxyName.startsWith(`${pattern}/`)) {
    return true
  }

  return false
}

const findAutoDetourGroup = (
  prefix: string,
  proxies: Record<string, Proxy>,
): string | undefined => {
  if (!prefix.endsWith('落地') || prefix.length <= 2) {
    return undefined
  }

  const candidate = `${prefix.slice(0, -2)}跳板`

  if (proxies[candidate]) {
    return candidate
  }

  return Object.values(proxies).find((proxy) => proxy.all?.length && proxy.name.endsWith(candidate))
    ?.name
}

export const resolveConfiguredProxyDetour = (
  proxyName: string,
  proxies: Record<string, Proxy>,
  rules: readonly ProxyDetourRule[],
  backendUuid?: string,
  autoDetect = true,
): string | undefined => {
  if (!proxyName) return undefined

  const node = proxies[proxyName]
  const providerName = node?.['provider-name'] ?? ''

  for (const rule of rules) {
    if (!isRuleInScope(rule, backendUuid)) continue

    const detour = rule.detour.trim()
    if (!detour || detour === proxyName) continue

    if (matchesDetourRule(rule.match, proxyName, providerName)) {
      return detour
    }
  }

  if (!autoDetect) return undefined

  const prefixCandidates = new Set<string>()
  if (providerName) {
    prefixCandidates.add(providerName)
  }
  const slashIndex = proxyName.indexOf('/')
  if (slashIndex > 0) {
    prefixCandidates.add(proxyName.slice(0, slashIndex))
  }

  for (const prefix of prefixCandidates) {
    const detected = findAutoDetourGroup(prefix, proxies)
    if (detected && detected !== proxyName) {
      return detected
    }
  }

  return undefined
}

export const resolveEffectiveDialerProxy = (
  proxyName: string,
  proxies: Record<string, Proxy>,
  rules: readonly ProxyDetourRule[],
  backendUuid?: string,
  autoDetect = true,
): string | undefined => {
  const nativeDialer = proxies[proxyName]?.['dialer-proxy']
  if (nativeDialer) return nativeDialer

  return resolveConfiguredProxyDetour(proxyName, proxies, rules, backendUuid, autoDetect)
}

export const resolveDetourProxyChains = (
  detourTarget: string,
  proxies: Record<string, Proxy>,
): string[] => {
  if (!detourTarget) return []

  const path: string[] = []
  const visited = new Set<string>()
  let current = detourTarget

  while (current && !visited.has(current) && path.length < MAX_CHAIN_DEPTH) {
    visited.add(current)
    path.push(current)

    const next = proxies[current]?.now
    if (!next || next === current) {
      break
    }

    current = next
  }

  // Clash chains order: final outbound at index 0, entry group at the end.
  return path.reverse()
}

export const detectAutoDetourPairs = (
  proxies: Record<string, Proxy>,
  providers: readonly ProxyProvider[],
): Array<{ match: string; detour: string }> => {
  const seen = new Set<string>()
  const pairs: Array<{ match: string; detour: string }> = []

  const tryAdd = (prefix: string) => {
    if (!prefix || seen.has(prefix)) return

    const detour = findAutoDetourGroup(prefix, proxies)
    if (detour) {
      seen.add(prefix)
      pairs.push({ match: prefix, detour })
    }
  }

  for (const provider of providers) {
    tryAdd(provider.name)
  }

  for (const proxyName of Object.keys(proxies)) {
    const slashIndex = proxyName.indexOf('/')
    if (slashIndex > 0) {
      tryAdd(proxyName.slice(0, slashIndex))
    }
  }

  return pairs
}

const isClashConnection = (
  conn: Connection,
): conn is ClashConnectionRawMessage & {
  downloadSpeed: number
  uploadSpeed: number
} => !('daeRaw' in conn)

const formatOriginalTarget = (conn: ClashConnectionRawMessage) => {
  const host = conn.metadata.host || conn.metadata.sniffHost || conn.metadata.destinationIP || ''
  const port = conn.metadata.destinationPort || ''

  if (!host) return ''
  if (!port) return host
  return host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`
}

export const deriveDetourInnerConnectionsForConnection = (
  conn: Connection,
  proxies: Record<string, Proxy>,
  rules: readonly ProxyDetourRule[],
  backendUuid?: string,
  autoDetect = true,
): Connection[] => {
  if (!isClashConnection(conn)) return []
  if (conn.metadata.sourceIP === '' || conn.metadata.type.toLowerCase() === 'inner') return []
  if (!conn.chains?.length) return []

  const derived: Connection[] = []
  const visitedNodes = new Set<string>()
  let currentNode = conn.chains[0]
  let hop = 0
  const originalTarget = formatOriginalTarget(conn)

  while (currentNode && !visitedNodes.has(currentNode) && hop < MAX_CHAIN_DEPTH) {
    visitedNodes.add(currentNode)

    // Native dialer-proxy (e.g. Mihomo) already reports its own Inner connections.
    if (proxies[currentNode]?.['dialer-proxy']) {
      break
    }

    const detourTarget = resolveConfiguredProxyDetour(
      currentNode,
      proxies,
      rules,
      backendUuid,
      autoDetect,
    )
    if (!detourTarget) {
      break
    }

    const detourChains = resolveDetourProxyChains(detourTarget, proxies)
    if (!detourChains.length) {
      break
    }

    derived.push({
      ...conn,
      id: `${INNER_DETOUR_ID_PREFIX}${hop}:${conn.id}`,
      chains: detourChains,
      rule: 'Detour',
      rulePayload: originalTarget,
      metadata: {
        ...conn.metadata,
        type: 'Inner',
        sourceIP: '',
        sourcePort: '',
        host: currentNode,
        destinationPort: '',
        sniffHost: conn.metadata.host || conn.metadata.sniffHost || '',
        remoteDestination: '',
        process: currentNode,
        processPath: '',
        inboundName: 'Inner',
        inboundPort: '',
        inboundUser: '',
      },
    })

    const nextNode = detourChains[0]
    if (!nextNode || nextNode === currentNode) {
      break
    }

    currentNode = nextNode
    hop++
  }

  return derived
}

export const expandConnectionsWithDetourInner = (
  items: readonly Connection[],
  proxies: Record<string, Proxy>,
  rules: readonly ProxyDetourRule[],
  backendUuid?: string,
  autoDetect = true,
  enabled = true,
): Connection[] => {
  if (!enabled || !items.length) {
    return items as Connection[]
  }

  const result: Connection[] = []

  for (const conn of items) {
    result.push(conn)
    const derived = deriveDetourInnerConnectionsForConnection(
      conn,
      proxies,
      rules,
      backendUuid,
      autoDetect,
    )
    if (derived.length) {
      result.push(...derived)
    }
  }

  return result
}
