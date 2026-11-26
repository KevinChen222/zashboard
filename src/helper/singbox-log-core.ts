import type { LogWithSeq } from '../types'

const ANSI_ESCAPE_REGEX = /\u001B\[[0-9;]*m/g
const CONN_PREFIX_REGEX = /^\[(\d+)\s+([^\]]+)\]\s+(.*)$/

const INBOUND_CONN_REGEX =
  /^inbound\/([a-z0-9_-]+)\[(.+)\]:\s+inbound\s+(packet\s+)?connection\s+(from|to)\s+(.+)$/i

const INBOUND_DNS_REGEX = /^inbound\/([a-z0-9_-]+)\[(.+)\]:\s+inbound\s+dns\b/i

const OUTBOUND_CONN_REGEX =
  /^outbound\/([a-z0-9_-]+)\[(.+)\]:\s+outbound\s+(packet\s+)?connection(?:\s+to\s+(.+))?$/i

const OUTBOUND_BLOCK_REGEX =
  /^outbound\/block\[(.+)\]:\s+blocked\s+(packet\s+)?connection(?:\s+to\s+(.+))?$/i

const OUTBOUND_URLTEST_REGEX = /^outbound\/urltest\[(.+)\]:/i

const ROUTER_NEIGHBOR_REGEX = /^router:\s+found\s+neighbor:\s+[^,]+(?:,\s+hostname:\s+(.+))?$/i
const ROUTER_PROCESS_REGEX = /^router:\s+found\s+(?:process|package)\b/i
const ROUTER_SNIFFED_REGEX = /^router:\s+sniffed\s+protocol:\s+[^,]+(?:,\s+domain:\s+(.+))?$/i
const ROUTER_MATCH_REGEX = /^router:\s+match\[\d+\]/i
const ROUTER_HIJACK_DNS_REGEX = /^router:\s+.*hijack[- ]dns\b/i
const ROUTER_REJECT_REGEX =
  /^router:\s+(?:connection\s+)?(rejected|dropped)(?:\s+(?:packet\s+)?connection(?:\s+to\s+(.+))?)?$/i

const DNS_LOG_REGEX = /^dns(?:\/[a-z0-9_-]+\[[^\]]+\])?:/i
const DNS_INBOUND_TAG_REGEX = /(?:^|[-_])dns(?:[-_]|$)/i
const IPV4_HOST_REGEX = /^(?:\d{1,3}\.){3}\d{1,3}$/

type ConnectionRecord = {
  connId: string
  inboundType?: string
  inboundTag?: string
  isPacket: boolean
  source?: string
  inboundDest?: string
  hostname?: string
  sniffedDomain?: string
  anchorIndex?: number
  exitTag?: string
  dest?: string
  network?: 'TCP' | 'UDP'
  relays: string[]
  isDnsInbound: boolean
}

export const stripAnsiCodes = (text: string): string => text.replace(ANSI_ESCAPE_REGEX, '')

const CONN_ID_ONLY_REGEX = /^\[(\d+)\s[^\]]*\]/

export const getSingboxConnectionId = (payload: string): string | null => {
  return stripAnsiCodes(payload).match(CONN_ID_ONLY_REGEX)?.[1] ?? null
}

const isIpLiteral = (host: string): boolean => {
  if (!host) return false
  if (host.includes(':')) return true
  return IPV4_HOST_REGEX.test(host)
}

const applySniffedDomain = (dest?: string, sniffedDomain?: string): string => {
  const cleanDest = dest?.trim() ?? ''
  const cleanDomain = sniffedDomain?.trim() ?? ''

  if (!cleanDest) return cleanDomain
  if (!cleanDomain) return cleanDest

  const ipv6WithPort = cleanDest.match(/^\[([^\]]+)\]:(\d+)$/)
  if (ipv6WithPort) {
    return `${cleanDomain}:${ipv6WithPort[2]}`
  }

  const hostWithPort = cleanDest.match(/^([^:\s]+):(\d+)$/)
  if (hostWithPort && isIpLiteral(hostWithPort[1])) {
    return `${cleanDomain}:${hostWithPort[2]}`
  }

  if (isIpLiteral(cleanDest)) {
    return cleanDomain
  }

  return cleanDest
}

const formatSource = (source?: string, hostname?: string): string => {
  if (!source) return ''
  const trimmed = source.trim()
  if (!trimmed) return ''

  // Zashboard's sourceIPLabelList rewrites "192.168.2.115:44974" -> "192.168.2.115 (Label) :44974"
  // and "[fdaa:...]:46990" -> "[fdaa:...] (Label) :46990". Preserve user label without duplicating hostname.
  const labeledMatch = trimmed.match(/^(.+\s\([^)]+\))\s*:(\d+)$/)
  if (labeledMatch) {
    return `${labeledMatch[1]}:${labeledMatch[2]}`
  }

  const cleanHost = hostname?.trim()
  if (!cleanHost) {
    return trimmed
  }

  const ipv6Match = trimmed.match(/^(\[[^\]]+\]):(\d+)$/)
  if (ipv6Match) {
    return `${ipv6Match[1]} (${cleanHost}):${ipv6Match[2]}`
  }

  const ipv4Match = trimmed.match(/^([^:\s]+):(\d+)$/)
  if (ipv4Match) {
    return `${ipv4Match[1]} (${cleanHost}):${ipv4Match[2]}`
  }

  return `${trimmed} (${cleanHost})`
}

const formatConciseTrafficPayload = (conn: ConnectionRecord): string => {
  const network = conn.network ?? (conn.isPacket ? 'UDP' : 'TCP')
  const source = formatSource(conn.source, conn.hostname)
  const dest = applySniffedDomain(conn.dest || conn.inboundDest, conn.sniffedDomain)
  const route =
    conn.relays.length > 0
      ? `${conn.exitTag} (via ${conn.relays.join(' -> ')})`
      : (conn.exitTag ?? '')

  if (source && dest) {
    return `[${network}] ${source} --> ${dest} using ${route}`
  }
  if (dest) {
    return `[${network}] --> ${dest} using ${route}`
  }
  if (source) {
    return `[${network}] ${source} using ${route}`
  }
  return `[${network}] using ${route}`
}

const isStandaloneInfoNoise = (body: string): boolean => {
  if (DNS_LOG_REGEX.test(body)) return true
  if (INBOUND_DNS_REGEX.test(body)) return true
  if (ROUTER_HIJACK_DNS_REGEX.test(body)) return true
  if (OUTBOUND_CONN_REGEX.test(body)) return true
  if (OUTBOUND_URLTEST_REGEX.test(body)) return true
  if (INBOUND_CONN_REGEX.test(body)) return true
  return false
}

const isConnNoiseBody = (body: string): boolean => {
  if (INBOUND_CONN_REGEX.test(body)) return true
  if (ROUTER_NEIGHBOR_REGEX.test(body)) return true
  if (ROUTER_PROCESS_REGEX.test(body)) return true
  if (ROUTER_SNIFFED_REGEX.test(body)) return true
  if (ROUTER_MATCH_REGEX.test(body)) return true
  if (DNS_LOG_REGEX.test(body)) return true
  return false
}

const isInfoLevel = (type: string): boolean => type.toLowerCase() === 'info'

export const simplifySingboxInfoLogs = (
  rawLogs: readonly LogWithSeq[],
  enabled = true,
): LogWithSeq[] => {
  if (!enabled || rawLogs.length === 0) {
    return rawLogs as LogWithSeq[]
  }

  const connections = new Map<string, ConnectionRecord>()
  const suppressedIndices = new Set<number>()

  const getOrCreateConn = (connId: string): ConnectionRecord => {
    let conn = connections.get(connId)
    if (!conn) {
      conn = {
        connId,
        isPacket: false,
        relays: [],
        isDnsInbound: false,
      }
      connections.set(connId, conn)
    }
    return conn
  }

  // logs.value is stored newest-first; scan oldest -> newest to correlate each connection chronologically.
  for (let i = rawLogs.length - 1; i >= 0; i--) {
    const log = rawLogs[i]
    if (!isInfoLevel(log.type)) {
      continue
    }

    const clean = stripAnsiCodes(log.payload).trim()
    const prefixMatch = clean.match(CONN_PREFIX_REGEX)

    if (!prefixMatch) {
      if (isStandaloneInfoNoise(clean)) {
        suppressedIndices.add(i)
      }
      continue
    }

    const connId = prefixMatch[1]
    const body = prefixMatch[3]
    const conn = getOrCreateConn(connId)

    if (INBOUND_DNS_REGEX.test(body)) {
      conn.isDnsInbound = true
      suppressedIndices.add(i)
      continue
    }

    const inboundMatch = body.match(INBOUND_CONN_REGEX)
    if (inboundMatch) {
      const [, inboundType, inboundTag, packetKeyword, direction, addr] = inboundMatch
      conn.inboundType = inboundType.toLowerCase()
      conn.inboundTag = inboundTag
      if (packetKeyword) {
        conn.isPacket = true
      }
      if (DNS_INBOUND_TAG_REGEX.test(inboundTag)) {
        conn.isDnsInbound = true
      }
      if (direction.toLowerCase() === 'from') {
        conn.source = addr.trim()
      } else {
        conn.inboundDest = addr.trim()
      }
      suppressedIndices.add(i)
      continue
    }

    if (ROUTER_HIJACK_DNS_REGEX.test(body)) {
      conn.isDnsInbound = true
      suppressedIndices.add(i)
      continue
    }

    const neighborMatch = body.match(ROUTER_NEIGHBOR_REGEX)
    if (neighborMatch) {
      if (neighborMatch[1]) {
        conn.hostname = neighborMatch[1].trim()
      }
      suppressedIndices.add(i)
      continue
    }

    const sniffedMatch = body.match(ROUTER_SNIFFED_REGEX)
    if (sniffedMatch) {
      if (sniffedMatch[1]) {
        conn.sniffedDomain = sniffedMatch[1].trim()
      }
      suppressedIndices.add(i)
      continue
    }

    if (isConnNoiseBody(body)) {
      suppressedIndices.add(i)
      continue
    }

    const outboundMatch = body.match(OUTBOUND_CONN_REGEX)
    if (outboundMatch) {
      const [, outboundType, outboundTag, packetKeyword, dest] = outboundMatch
      const normalizedType = outboundType.toLowerCase()

      if (normalizedType === 'dns' || conn.isDnsInbound) {
        suppressedIndices.add(i)
        continue
      }

      if (conn.anchorIndex === undefined) {
        conn.anchorIndex = i
        conn.exitTag = outboundTag
        conn.dest = dest?.trim() || conn.inboundDest
        conn.network = packetKeyword || conn.isPacket ? 'UDP' : 'TCP'
      } else {
        const lastHop = conn.relays[conn.relays.length - 1]
        if (outboundTag !== conn.exitTag && outboundTag !== lastHop) {
          conn.relays.push(outboundTag)
        }
        suppressedIndices.add(i)
      }
      continue
    }

    const blockMatch = body.match(OUTBOUND_BLOCK_REGEX)
    if (blockMatch) {
      const [, blockTag, packetKeyword, dest] = blockMatch
      if (conn.isDnsInbound) {
        suppressedIndices.add(i)
        continue
      }
      if (conn.anchorIndex === undefined) {
        conn.anchorIndex = i
        conn.exitTag = blockTag || 'REJECT'
        conn.dest = dest?.trim() || conn.inboundDest
        conn.network = packetKeyword || conn.isPacket ? 'UDP' : 'TCP'
      } else {
        suppressedIndices.add(i)
      }
      continue
    }

    const rejectMatch = body.match(ROUTER_REJECT_REGEX)
    if (rejectMatch) {
      const [, action, dest] = rejectMatch
      if (conn.isDnsInbound) {
        suppressedIndices.add(i)
        continue
      }
      if (conn.anchorIndex === undefined) {
        conn.anchorIndex = i
        conn.exitTag = action.toLowerCase() === 'dropped' ? 'DROP' : 'REJECT'
        conn.dest = dest?.trim() || conn.inboundDest
        conn.network = conn.isPacket ? 'UDP' : 'TCP'
      } else {
        suppressedIndices.add(i)
      }
      continue
    }
  }

  const anchorByIndex = new Map<number, ConnectionRecord>()
  for (const conn of connections.values()) {
    if (conn.anchorIndex !== undefined && !conn.isDnsInbound) {
      anchorByIndex.set(conn.anchorIndex, conn)
    }
  }

  const result: LogWithSeq[] = []
  for (let i = 0; i < rawLogs.length; i++) {
    if (suppressedIndices.has(i)) {
      continue
    }

    const log = rawLogs[i]
    const anchor = anchorByIndex.get(i)
    if (anchor) {
      result.push({
        ...log,
        payload: formatConciseTrafficPayload(anchor),
        connectionId: anchor.connId,
      })
    } else {
      result.push(log)
    }
  }

  return result
}

export const extractSingboxDisplayLogType = (payload: string): string => {
  const clean = stripAnsiCodes(payload).trim()
  if (!clean) return ''

  const bracketTag = clean.match(/^(\[[A-Z]+\])\s/)
  if (bracketTag) {
    return bracketTag[1]
  }

  const prefixMatch = clean.match(CONN_PREFIX_REGEX)
  const body = prefixMatch ? prefixMatch[3] : clean
  const colonIndex = body.indexOf(':')
  if (colonIndex !== -1) {
    return body.slice(0, colonIndex + 1)
  }

  const spaceIndex = body.indexOf(' ')
  return spaceIndex === -1 ? body : body.slice(0, spaceIndex)
}
