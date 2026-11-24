import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  deriveDetourInnerConnectionsForConnection,
  detectAutoDetourPairs,
  expandConnectionsWithDetourInner,
  getRealConnectionId,
  isDerivedDetourConnectionId,
  resolveConfiguredProxyDetour,
  resolveDetourProxyChains,
  resolveEffectiveDialerProxy,
} from '../src/helper/detour-chain-core.ts'
import type {
  ClashConnectionRawMessage,
  Connection,
  Proxy,
  ProxyDetourRule,
  ProxyProvider,
} from '../src/types'

const makeProxy = (name: string, patch: Partial<Proxy> = {}): Proxy => ({
  name,
  type: 'Shadowsocks',
  history: [],
  extra: {},
  now: '',
  icon: '',
  ...patch,
})

const makeConnection = (
  id: string,
  chains: string[],
  metaPatch: Partial<ClashConnectionRawMessage['metadata']> = {},
): Connection => ({
  id,
  download: 1024,
  upload: 512,
  downloadSpeed: 128,
  uploadSpeed: 64,
  chains,
  rule: 'RuleSet',
  rulePayload: 'chatgpt',
  start: '2026-11-24T15:21:43Z',
  metadata: {
    destinationGeoIP: '',
    destinationIP: '104.18.32.47',
    destinationIPASN: '',
    destinationPort: '443',
    dnsMode: 'normal',
    dscp: 0,
    host: 'ab.chatgpt.com',
    inboundIP: '',
    inboundName: 'redirect-in',
    inboundPort: '7892',
    inboundUser: '',
    network: 'tcp',
    process: '',
    processPath: '',
    remoteDestination: '',
    sniffHost: 'ab.chatgpt.com',
    sourceGeoIP: '',
    sourceIP: '192.168.2.115',
    sourceIPASN: '',
    sourcePort: '46514',
    specialProxy: '',
    specialRules: '',
    type: 'redirect/redirect-in',
    uid: 0,
    smartBlock: '',
    ...metaPatch,
  },
})

const sampleProxies: Record<string, Proxy> = {
  '美洲落地/🇺🇸 德州家宽 t1转发': makeProxy('美洲落地/🇺🇸 德州家宽 t1转发', {
    'provider-name': '美洲落地',
  }),
  '香港落地/🇭🇰 HK家宽': makeProxy('香港落地/🇭🇰 HK家宽', {
    'provider-name': '香港落地',
  }),
  美洲跳板: makeProxy('美洲跳板', {
    type: 'Selector',
    all: ['⭐ 日本自动', '⭐ 美国自动', '🎯 全球直连'],
    now: '⭐ 日本自动',
  }),
  香港跳板: makeProxy('香港跳板', {
    type: 'Selector',
    all: ['⭐ 香港自动'],
    now: '⭐ 香港自动',
  }),
  '⭐ 日本自动': makeProxy('⭐ 日本自动', {
    type: 'URLTest',
    all: ['主用机场/🇯🇵 日本 02 Astrix'],
    now: '主用机场/🇯🇵 日本 02 Astrix',
  }),
  '⭐ 香港自动': makeProxy('⭐ 香港自动', {
    type: 'URLTest',
    all: ['主用机场/🇭🇰 香港 01'],
    now: '主用机场/🇭🇰 香港 01',
  }),
  '主用机场/🇯🇵 日本 02 Astrix': makeProxy('主用机场/🇯🇵 日本 02 Astrix', {
    type: 'AnyTLS',
    'provider-name': '主用机场',
  }),
  '主用机场/🇭🇰 香港 01': makeProxy('主用机场/🇭🇰 香港 01', {
    type: 'AnyTLS',
    'provider-name': '主用机场',
  }),
  '🎯 全球直连': makeProxy('🎯 全球直连', {
    type: 'Selector',
    all: ['direct-v6', 'direct-v4'],
    now: 'direct-v6',
  }),
  'direct-v6': makeProxy('direct-v6', { type: 'Direct' }),
}

describe('detour-chain-core', () => {
  it('auto-detects XX落地 -> XX跳板 and expands full relay chains', () => {
    const detour = resolveConfiguredProxyDetour(
      '美洲落地/🇺🇸 德州家宽 t1转发',
      sampleProxies,
      [],
      'backend-1',
      true,
    )
    assert.equal(detour, '美洲跳板')

    const chains = resolveDetourProxyChains(detour!, sampleProxies)
    assert.deepEqual(chains, ['主用机场/🇯🇵 日本 02 Astrix', '⭐ 日本自动', '美洲跳板'])
  })

  it('derives Mihomo-compatible Inner connection for sing-box chained connection', () => {
    const conn = makeConnection('conn-123', [
      '美洲落地/🇺🇸 德州家宽 t1转发',
      '⚫ 美洲链式',
      '🤖 AI',
      '🌀 ChatGPT',
    ])

    const expanded = expandConnectionsWithDetourInner(
      [conn],
      sampleProxies,
      [],
      'backend-1',
      true,
      true,
    )
    assert.equal(expanded.length, 2)

    const inner = expanded[1] as ClashConnectionRawMessage & {
      downloadSpeed: number
      uploadSpeed: number
    }
    assert.equal(isDerivedDetourConnectionId(inner.id), true)
    assert.equal(getRealConnectionId(inner.id), 'conn-123')
    assert.equal(inner.metadata.sourceIP, '')
    assert.equal(inner.metadata.type, 'Inner')
    assert.equal(inner.metadata.host, '美洲落地/🇺🇸 德州家宽 t1转发')
    assert.equal(inner.metadata.destinationPort, '')
    assert.equal(inner.rule, 'Detour')
    assert.equal(inner.rulePayload, 'ab.chatgpt.com:443')
    assert.equal(inner.download, 1024)
    assert.equal(inner.downloadSpeed, 128)
    assert.deepEqual(inner.chains, ['主用机场/🇯🇵 日本 02 Astrix', '⭐ 日本自动', '美洲跳板'])
  })

  it('respects custom rules priority, regex matching, and backend scope', () => {
    const rules: ProxyDetourRule[] = [
      { id: '1', match: '美洲落地/', detour: '香港跳板', scope: ['backend-2'] },
      { id: '2', match: '/德州家宽', detour: '🎯 全球直连', scope: ['backend-1'] },
    ]

    assert.equal(
      resolveConfiguredProxyDetour(
        '美洲落地/🇺🇸 德州家宽 t1转发',
        sampleProxies,
        rules,
        'backend-1',
        false,
      ),
      '🎯 全球直连',
    )
    assert.equal(
      resolveConfiguredProxyDetour(
        '美洲落地/🇺🇸 德州家宽 t1转发',
        sampleProxies,
        rules,
        'backend-2',
        false,
      ),
      '香港跳板',
    )
  })

  it('does not duplicate Inner connections when backend natively provides dialer-proxy (Mihomo)', () => {
    const mihomoProxies: Record<string, Proxy> = {
      ...sampleProxies,
      '美洲落地/🇺🇸 德州家宽 t1转发': makeProxy('美洲落地/🇺🇸 德州家宽 t1转发', {
        'provider-name': '美洲落地',
        'dialer-proxy': '美洲跳板',
      }),
    }

    assert.equal(
      resolveEffectiveDialerProxy('美洲落地/🇺🇸 德州家宽 t1转发', mihomoProxies, [], 'b1', true),
      '美洲跳板',
    )

    const conn = makeConnection('mihomo-1', ['美洲落地/🇺🇸 德州家宽 t1转发', '⚫ 美洲链式'])
    const derived = deriveDetourInnerConnectionsForConnection(conn, mihomoProxies, [], 'b1', true)
    assert.equal(derived.length, 0)
  })

  it('handles multi-hop chains safely and stops on cycles', () => {
    const cyclicProxies: Record<string, Proxy> = {
      'A/node1': makeProxy('A/node1'),
      'B/node2': makeProxy('B/node2'),
      GroupB: makeProxy('GroupB', { type: 'Selector', now: 'B/node2', all: ['B/node2'] }),
      GroupA: makeProxy('GroupA', { type: 'Selector', now: 'A/node1', all: ['A/node1'] }),
    }
    const rules: ProxyDetourRule[] = [
      { id: 'r1', match: 'A/', detour: 'GroupB' },
      { id: 'r2', match: 'B/', detour: 'GroupA' },
    ]

    const conn = makeConnection('cycle-1', ['A/node1'])
    const derived = deriveDetourInnerConnectionsForConnection(
      conn,
      cyclicProxies,
      rules,
      'b1',
      false,
    )

    assert.equal(derived.length, 2)
    assert.equal(getRealConnectionId(derived[0].id), 'cycle-1')
    assert.equal(getRealConnectionId(derived[1].id), 'cycle-1')
  })

  it('skips direct connections, native Inner connections, and disabled toggle', () => {
    const directConn = makeConnection('d1', ['direct-v6', '🎯 全球直连'])
    const nativeInner = makeConnection('i1', ['美洲落地/🇺🇸 德州家宽 t1转发'], {
      sourceIP: '',
      type: 'Inner',
    })

    assert.equal(
      expandConnectionsWithDetourInner(
        [directConn, nativeInner],
        sampleProxies,
        [],
        'b1',
        true,
        true,
      ).length,
      2,
    )

    const chainedConn = makeConnection('c1', ['美洲落地/🇺🇸 德州家宽 t1转发', '⚫ 美洲链式'])
    assert.equal(
      expandConnectionsWithDetourInner([chainedConn], sampleProxies, [], 'b1', true, false).length,
      1,
    )
  })

  it('discovers auto-detectable pairs for one-click import', () => {
    const providers: ProxyProvider[] = [
      { name: '美洲落地', proxies: [], testUrl: '', updatedAt: '', vehicleType: 'HTTP' },
      { name: '香港落地', proxies: [], testUrl: '', updatedAt: '', vehicleType: 'HTTP' },
      { name: '主用机场', proxies: [], testUrl: '', updatedAt: '', vehicleType: 'HTTP' },
    ]

    const pairs = detectAutoDetourPairs(sampleProxies, providers)
    assert.deepEqual(pairs, [
      { match: '美洲落地', detour: '美洲跳板' },
      { match: '香港落地', detour: '香港跳板' },
    ])
  })
})
