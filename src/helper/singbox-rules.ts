import type { Rule } from '@/types'

export interface FormattedSingboxRule {
  displayType: string
  displayPayload: string
  actionLabel?: string
  optionsLabel?: string
  singleRuleSet?: string
  isProxyTarget: boolean
}

export interface ParsedSingboxAction {
  target: string
  actionLabel?: string
  optionsLabel?: string
  isProxyTarget: boolean
}

const BUILTIN_ROUTE_TARGETS = new Set(['DIRECT', 'REJECT', 'GLOBAL', 'PASS', 'COMPATIBLE'])

const SINGBOX_KEY_TYPE_MAP: Record<string, string> = {
  rule_set: 'RULE-SET',
  domain: 'DOMAIN',
  domain_suffix: 'DOMAIN-SUFFIX',
  domain_keyword: 'DOMAIN-KEYWORD',
  domain_regex: 'DOMAIN-REGEX',
  ip_cidr: 'IP-CIDR',
  source_ip_cidr: 'SRC-IP-CIDR',
  source_mac_address: 'SRC-MAC',
  port: 'DST-PORT',
  port_range: 'DST-PORT',
  source_port: 'SRC-PORT',
  source_port_range: 'SRC-PORT',
  network: 'NETWORK',
  inbound: 'INBOUND',
  clash_mode: 'CLASH-MODE',
  ip_is_private: 'IP-PRIVATE',
  source_ip_is_private: 'SRC-IP-PRIVATE',
  query_type: 'QUERY-TYPE',
  preferred_by: 'PREFERRED-BY',
  protocol: 'PROTOCOL',
  process_name: 'PROCESS-NAME',
  process_path: 'PROCESS-PATH',
  outbound: 'OUTBOUND',
}

const mapSingboxKeyToType = (key: string): string => {
  return SINGBOX_KEY_TYPE_MAP[key] ?? key.toUpperCase().replace(/_/g, '-')
}

const formatBracketList = (value: string): string => {
  const trimmed = value.trim()
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1).trim().split(/\s+/).filter(Boolean).join(', ')
  }
  return trimmed
}

const cleanLogicalExpression = (payload: string): string => {
  return payload.replace(/\[([^\]]+)\]/g, (_, inner: string) => {
    const items = inner.trim().split(/\s+/).filter(Boolean)
    return `[${items.join(', ')}]`
  })
}

const splitTopLevelTokens = (input: string): string[] => {
  const tokens: string[] = []
  let current = ''
  let bracketDepth = 0
  let parenDepth = 0

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === '[') bracketDepth++
    else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1)
    else if (ch === '(') parenDepth++
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1)

    if (/\s/.test(ch) && bracketDepth === 0 && parenDepth === 0) {
      if (current) {
        tokens.push(current)
        current = ''
      }
    } else {
      current += ch
    }
  }

  if (current) {
    tokens.push(current)
  }

  return tokens
}

export const parseSingboxProxyAction = (rawProxy: string): ParsedSingboxAction => {
  const trimmed = (rawProxy || '').trim()

  const fnMatch = /^([a-z0-9-]+)\((.*)\)$/i.exec(trimmed)
  if (fnMatch) {
    const fnName = fnMatch[1].toLowerCase()
    const inner = fnMatch[2].trim()
    const parts = inner
      ? inner
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
      : []

    if (fnName === 'route') {
      const [target = '', ...options] = parts
      return {
        target,
        optionsLabel: options.length > 0 ? options.join(', ') : undefined,
        isProxyTarget: true,
      }
    }

    if (fnName === 'bypass') {
      const [target = '', ...options] = parts
      return {
        target,
        actionLabel: 'bypass',
        optionsLabel: options.length > 0 ? options.join(', ') : undefined,
        isProxyTarget: true,
      }
    }

    return {
      target: '',
      actionLabel: fnMatch[1],
      optionsLabel: parts.length > 0 ? parts.join(', ') : undefined,
      isProxyTarget: false,
    }
  }

  if (
    trimmed === 'hijack-dns' ||
    trimmed === 'sniff' ||
    trimmed === 'sniff-override-destination' ||
    trimmed === 'resolve' ||
    trimmed === 'route-options' ||
    trimmed === 'reject'
  ) {
    return {
      target: '',
      actionLabel: trimmed,
      isProxyTarget: false,
    }
  }

  return {
    target: trimmed,
    isProxyTarget: true,
  }
}

export const unwrapSingboxRuleProxy = (rawProxy: string): string => {
  const parsed = parseSingboxProxyAction(rawProxy)
  if (parsed.isProxyTarget && parsed.target) {
    return parsed.target
  }
  return rawProxy
}

export const isSingboxRouteAction = (rawProxy: string): boolean => {
  const trimmed = (rawProxy || '').trim()
  return (
    trimmed === 'hijack-dns' ||
    trimmed.startsWith('hijack-dns(') ||
    trimmed === 'sniff' ||
    trimmed.startsWith('sniff(') ||
    trimmed.startsWith('sniff-') ||
    trimmed.startsWith('resolve(') ||
    trimmed === 'resolve' ||
    trimmed.startsWith('bypass(') ||
    trimmed.startsWith('route-options(')
  )
}

export const isSingboxDnsRule = (
  rule: Pick<Rule, 'payload' | 'proxy' | 'rawProxy'>,
  proxyNames: Set<string>,
  indexInList: number,
  firstRouteActionIndex: number,
): boolean => {
  const raw = (rule.rawProxy ?? rule.proxy ?? '').trim()

  if (isSingboxRouteAction(raw)) {
    return false
  }

  if (raw.startsWith('predefined(')) {
    return true
  }

  if (/(?:^|[,(])(?:rewrite-ttl=|disable-cache|client-subnet=)/.test(raw)) {
    return true
  }

  if (/(?:^|[\s(])(?:preferred_by|query_type)=/.test(rule.payload || '')) {
    return true
  }

  const routeMatch = /^route\(([^,)]+)/i.exec(raw)
  if (routeMatch) {
    const target = routeMatch[1].trim()
    if (proxyNames.size > 0) {
      return !proxyNames.has(target) && !BUILTIN_ROUTE_TARGETS.has(target.toUpperCase())
    }
    return firstRouteActionIndex > 0 && indexInList < firstRouteActionIndex
  }

  return false
}

export const splitSingboxRules = <T extends Pick<Rule, 'payload' | 'proxy' | 'rawProxy'>>(
  rules: T[],
  proxyNames: Set<string>,
): { routeRules: T[]; dnsRules: T[] } => {
  const firstRouteActionIndex = rules.findIndex((rule) =>
    isSingboxRouteAction(rule.rawProxy ?? rule.proxy),
  )

  const routeRules: T[] = []
  const dnsRules: T[] = []

  rules.forEach((rule, index) => {
    if (isSingboxDnsRule(rule, proxyNames, index, firstRouteActionIndex)) {
      dnsRules.push(rule)
    } else {
      routeRules.push(rule)
    }
  })

  return { routeRules, dnsRules }
}

const formatSingboxMatcher = (
  type: string,
  payload: string,
): { displayType: string; displayPayload: string; singleRuleSet?: string } => {
  const trimmed = (payload || '').trim()

  if (!trimmed) {
    return {
      displayType: 'MATCH',
      displayPayload: '',
    }
  }

  if (type === 'logical') {
    return {
      displayType: 'LOGICAL',
      displayPayload: cleanLogicalExpression(trimmed),
    }
  }

  const tokens = splitTopLevelTokens(trimmed)
  if (tokens.length === 1) {
    const singleMatch = /^([a-z0-9_]+)=(.+)$/i.exec(tokens[0])
    if (singleMatch) {
      const key = singleMatch[1].toLowerCase()
      const rawValue = singleMatch[2].trim()
      const displayType = mapSingboxKeyToType(key)
      const displayPayload = formatBracketList(rawValue)
      const singleRuleSet =
        key === 'rule_set' && !rawValue.startsWith('[') && !/\s/.test(rawValue)
          ? rawValue
          : undefined

      return {
        displayType,
        displayPayload,
        singleRuleSet,
      }
    }
  }

  if (tokens.length > 1) {
    const formattedTokens = tokens.map((token) => {
      const m = /^([a-z0-9_]+)=(.+)$/i.exec(token)
      if (!m) return token
      return `${mapSingboxKeyToType(m[1].toLowerCase())}=${formatBracketList(m[2])}`
    })

    return {
      displayType: 'AND',
      displayPayload: formattedTokens.join(' && '),
    }
  }

  return {
    displayType: type === 'default' ? 'MATCH' : type,
    displayPayload: trimmed,
  }
}

export const formatSingboxRule = (
  rule: Pick<Rule, 'type' | 'payload' | 'proxy' | 'rawProxy'>,
): FormattedSingboxRule => {
  const matcher = formatSingboxMatcher(rule.type, rule.payload)
  const action = parseSingboxProxyAction(rule.rawProxy ?? rule.proxy)

  return {
    displayType: matcher.displayType,
    displayPayload: matcher.displayPayload,
    actionLabel: action.actionLabel,
    optionsLabel: action.optionsLabel,
    singleRuleSet: matcher.singleRuleSet,
    isProxyTarget: action.isProxyTarget,
  }
}

export const formatSingboxConnectionRule = (rule: string): string => {
  const trimmed = (rule || '').trim()
  if (!trimmed) return ''

  const arrowMatch = /\s*=>\s*/.exec(trimmed)
  const matcherPart = arrowMatch ? trimmed.slice(0, arrowMatch.index).trim() : trimmed
  const actionPart = arrowMatch ? trimmed.slice(arrowMatch.index + arrowMatch[0].length).trim() : ''

  let actionSuffix = ''
  if (actionPart) {
    const parsed = parseSingboxProxyAction(actionPart)
    if (!parsed.isProxyTarget) {
      actionSuffix = ` => ${actionPart}`
    }
  }

  if (!matcherPart) {
    return `MATCH${actionSuffix}`
  }

  if (
    matcherPart.includes('&&') ||
    matcherPart.includes('||') ||
    /^[a-z0-9_]+=/i.test(matcherPart)
  ) {
    const inferredType =
      matcherPart.includes('&&') || matcherPart.includes('||') ? 'logical' : 'default'
    const formatted = formatSingboxMatcher(inferredType, matcherPart)
    const base = formatted.displayPayload
      ? `${formatted.displayType}: ${formatted.displayPayload}`
      : formatted.displayType
    return `${base}${actionSuffix}`
  }

  return `${matcherPart}${actionSuffix}`
}
