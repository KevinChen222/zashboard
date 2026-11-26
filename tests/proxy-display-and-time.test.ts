import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatProxyDisplayName } from '../src/helper/proxy-display-core.ts'
import { getTimestampValue, isValidTimestamp } from '../src/helper/time.ts'

describe('formatProxyDisplayName', () => {
  const providers = [
    {
      name: '主用机场',
      proxies: [
        { name: '主用机场/🇭🇰 花 HK EXP SHCU 01' },
        { name: '主用机场/🇭🇰 HK 01 / IEPL' },
        { name: '主用机场/' },
      ],
    },
    {
      name: '台湾落地',
      proxies: [{ name: '台湾落地/🇨🇳 seed 转发' }],
    },
    {
      name: 'airport/main',
      proxies: [{ name: 'airport/main/SG 01' }],
    },
  ]

  const proxies = {
    '主用机场/🇭🇰 花 HK EXP SHCU 01': { 'provider-name': '主用机场' },
    '主用机场/🇭🇰 HK 01 / IEPL': { 'provider-name': '主用机场' },
    // Simulates /proxies overwriting provider proxy entry without provider-name metadata
    '台湾落地/🇨🇳 seed 转发': {},
    '主用机场/精选': { all: ['主用机场/🇭🇰 花 HK EXP SHCU 01'] },
    '🇭🇰 自建 / 01': {},
    '主用机场/': { 'provider-name': '主用机场' },
    'airport/main/SG 01': { 'provider-name': 'airport/main' },
  }

  it('strips leading provider prefix using provider-name metadata', () => {
    assert.equal(
      formatProxyDisplayName('主用机场/🇭🇰 花 HK EXP SHCU 01', proxies, providers),
      '🇭🇰 花 HK EXP SHCU 01',
    )
  })

  it('preserves slashes inside the original node name', () => {
    assert.equal(
      formatProxyDisplayName('主用机场/🇭🇰 HK 01 / IEPL', proxies, providers),
      '🇭🇰 HK 01 / IEPL',
    )
  })

  it('falls back to provider list membership when proxyMap lacks provider-name', () => {
    assert.equal(
      formatProxyDisplayName('台湾落地/🇨🇳 seed 转发', proxies, providers),
      '🇨🇳 seed 转发',
    )
  })

  it('falls back to known provider prefix for historical/closed connection nodes', () => {
    assert.equal(
      formatProxyDisplayName('主用机场/🇯🇵 已下线节点', proxies, providers),
      '🇯🇵 已下线节点',
    )
  })

  it('does not strip non-provider nodes or proxy groups', () => {
    assert.equal(formatProxyDisplayName('🇭🇰 自建 / 01', proxies, providers), '🇭🇰 自建 / 01')
    assert.equal(formatProxyDisplayName('主用机场/精选', proxies, providers), '主用机场/精选')
    assert.equal(formatProxyDisplayName('DIRECT', proxies, providers), 'DIRECT')
  })

  it('does not produce an empty string when name equals providerName + slash', () => {
    assert.equal(formatProxyDisplayName('主用机场/', proxies, providers), '主用机场/')
  })

  it('supports provider names containing slashes', () => {
    assert.equal(formatProxyDisplayName('airport/main/SG 01', proxies, providers), 'SG 01')
  })
})

describe('timestamp validation helpers', () => {
  it('rejects Go zero-value timestamps and invalid/empty values', () => {
    assert.equal(isValidTimestamp('0001-01-01T00:00:00Z'), false)
    assert.equal(isValidTimestamp('0001-01-01T00:00:00+08:00'), false)
    assert.equal(isValidTimestamp('0001-01-01T00:00:00-06:00'), false)
    assert.equal(isValidTimestamp(''), false)
    assert.equal(isValidTimestamp(null), false)
    assert.equal(isValidTimestamp(undefined), false)
    assert.equal(isValidTimestamp(0), false)
    assert.equal(isValidTimestamp(Number.NaN), false)
    assert.equal(isValidTimestamp('not-a-date'), false)

    assert.equal(getTimestampValue('0001-01-01T00:00:00Z'), 0)
    assert.equal(getTimestampValue(''), 0)
  })

  it('accepts valid ISO strings and epoch timestamps', () => {
    const iso = '2026-11-26T15:14:23.992381581Z'
    assert.equal(isValidTimestamp(iso), true)
    assert.ok(getTimestampValue(iso) > 0)

    const epoch = 1795619663992
    assert.equal(isValidTimestamp(epoch), true)
    assert.equal(getTimestampValue(epoch), epoch)
  })
})
