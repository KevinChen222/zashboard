import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatSingboxConnectionRule,
  formatSingboxRule,
  isSingboxDnsRule,
  parseSingboxProxyAction,
  splitSingboxRules,
  unwrapSingboxRuleProxy,
} from '../src/helper/singbox-rules.ts'

describe('singbox-rules helper', () => {
  it('unwraps route(...) and bypass(...) targets while keeping non-proxy actions intact', () => {
    assert.equal(unwrapSingboxRuleProxy('route(❄ 谷歌服务)'), '❄ 谷歌服务')
    assert.equal(
      unwrapSingboxRuleProxy('route(fake-ip-dns-server,rewrite-ttl=60)'),
      'fake-ip-dns-server',
    )
    assert.equal(unwrapSingboxRuleProxy('bypass(🎯 全球直连)'), '🎯 全球直连')
    assert.equal(unwrapSingboxRuleProxy('hijack-dns'), 'hijack-dns')
    assert.equal(unwrapSingboxRuleProxy('predefined(NOERROR)'), 'predefined(NOERROR)')
    assert.equal(unwrapSingboxRuleProxy('sniff(http,300ms)'), 'sniff(http,300ms)')
  })

  it('parses proxy actions and options cleanly', () => {
    assert.deepEqual(parseSingboxProxyAction('route(fake-ip-dns-server,rewrite-ttl=60)'), {
      target: 'fake-ip-dns-server',
      optionsLabel: 'rewrite-ttl=60',
      isProxyTarget: true,
    })

    assert.deepEqual(parseSingboxProxyAction('bypass(🎯 全球直连)'), {
      target: '🎯 全球直连',
      actionLabel: 'bypass',
      optionsLabel: undefined,
      isProxyTarget: true,
    })

    assert.deepEqual(parseSingboxProxyAction('predefined(NOERROR)'), {
      target: '',
      actionLabel: 'predefined',
      optionsLabel: 'NOERROR',
      isProxyTarget: false,
    })

    assert.deepEqual(parseSingboxProxyAction('sniff(http,300ms)'), {
      target: '',
      actionLabel: 'sniff',
      optionsLabel: 'http, 300ms',
      isProxyTarget: false,
    })

    assert.deepEqual(parseSingboxProxyAction('resolve(dns_proxy,match_only)'), {
      target: '',
      actionLabel: 'resolve',
      optionsLabel: 'dns_proxy, match_only',
      isProxyTarget: false,
    })

    assert.deepEqual(parseSingboxProxyAction('hijack-dns'), {
      target: '',
      actionLabel: 'hijack-dns',
      isProxyTarget: false,
    })
  })

  it('splits live reF1nd/sing-box rules into clean Mihomo-style Route vs DNS/protocol rules', () => {
    const proxyNames = new Set(['🎯 全球直连', '🚀 节点选择', '❄ 谷歌服务', '📢 广告拦截'])
    const sampleRules = [
      {
        index: 0,
        uuid: 'u-0',
        type: 'default',
        payload: 'preferred_by=dns_hosts',
        proxy: 'dns_hosts',
        rawProxy: 'route(dns_hosts)',
      },
      {
        index: 1,
        uuid: 'u-1',
        type: 'default',
        payload: 'domain_suffix=911-gt2-rs.com',
        proxy: 'dns_rlose',
        rawProxy: 'route(dns_rlose)',
      },
      {
        index: 2,
        uuid: 'u-2',
        type: 'default',
        payload: 'query_type=[A AAAA] clash_mode=Global',
        proxy: 'fake-ip-dns-server',
        rawProxy: 'route(fake-ip-dns-server,rewrite-ttl=60)',
      },
      {
        index: 3,
        uuid: 'u-3',
        type: 'default',
        payload: 'query_type=[HTTPS SVCB] clash_mode=Global',
        proxy: 'predefined(NOERROR)',
        rawProxy: 'predefined(NOERROR)',
      },
      {
        index: 4,
        uuid: 'u-4',
        type: 'logical',
        payload: 'rule_set=fakeip-filter && rule_set=cn',
        proxy: 'dns_direct',
        rawProxy: 'route(dns_direct)',
      },
      {
        index: 5,
        uuid: 'u-5',
        type: 'default',
        payload: 'inbound=[dns-in dns-node-in]',
        proxy: 'hijack-dns',
        rawProxy: 'hijack-dns',
      },
      {
        index: 6,
        uuid: 'u-6',
        type: 'default',
        payload: 'ip_is_private=true',
        proxy: '🎯 全球直连',
        rawProxy: 'bypass(🎯 全球直连)',
      },
      {
        index: 7,
        uuid: 'u-7',
        type: 'logical',
        payload:
          'network=tcp port=80 && !(source_ip_cidr=192.168.0.0/16 || rule_set=[telegram_ip cnip])',
        proxy: 'sniff(http,300ms)',
        rawProxy: 'sniff(http,300ms)',
      },
      {
        index: 8,
        uuid: 'u-8',
        type: 'default',
        payload: 'domain_suffix=[netflix.com nflxext.com]',
        proxy: 'sniff-override-destination',
        rawProxy: 'sniff-override-destination',
      },
      {
        index: 9,
        uuid: 'u-9',
        type: 'default',
        payload: 'rule_set=Google',
        proxy: '❄ 谷歌服务',
        rawProxy: 'route(❄ 谷歌服务)',
      },
      {
        index: 10,
        uuid: 'u-10',
        type: 'default',
        payload: 'rule_set=ad',
        proxy: '📢 广告拦截',
        rawProxy: 'route(📢 广告拦截)',
      },
      {
        index: 11,
        uuid: 'u-11',
        type: 'default',
        payload: 'domain_suffix=blocked.example',
        proxy: 'reject',
        rawProxy: 'reject',
      },
      {
        index: 12,
        uuid: 'u-12',
        type: 'default',
        payload: '',
        proxy: 'resolve(dns_proxy,match_only)',
        rawProxy: 'resolve(dns_proxy,match_only)',
      },
      {
        index: 13,
        uuid: 'u-13',
        type: 'default',
        payload: 'port=443',
        proxy: 'route-options(udp_disable_domain_unmapping=true)',
        rawProxy: 'route-options(udp_disable_domain_unmapping=true)',
      },
    ]

    const { dnsRules, routeRules } = splitSingboxRules(sampleRules, proxyNames)

    // DNS tab receives all 5 DNS rules + 5 protocol/action rules (hijack-dns, sniff, sniff-override-destination, resolve, route-options)
    assert.equal(dnsRules.length, 10)
    assert.deepEqual(
      dnsRules.map((r) => r.rawProxy),
      [
        'route(dns_hosts)',
        'route(dns_rlose)',
        'route(fake-ip-dns-server,rewrite-ttl=60)',
        'predefined(NOERROR)',
        'route(dns_direct)',
        'hijack-dns',
        'sniff(http,300ms)',
        'sniff-override-destination',
        'resolve(dns_proxy,match_only)',
        'route-options(udp_disable_domain_unmapping=true)',
      ],
    )

    // Route tab stays clean like Mihomo: only bypass, outbound routes, and reject
    assert.equal(routeRules.length, 4)
    assert.deepEqual(
      routeRules.map((r) => r.rawProxy),
      ['bypass(🎯 全球直连)', 'route(❄ 谷歌服务)', 'route(📢 广告拦截)', 'reject'],
    )
    // Original backend index and uuid remain untouched for toggle actions
    assert.deepEqual(
      routeRules.map((r) => ({ index: r.index, uuid: r.uuid })),
      [
        { index: 6, uuid: 'u-6' },
        { index: 9, uuid: 'u-9' },
        { index: 10, uuid: 'u-10' },
        { index: 11, uuid: 'u-11' },
      ],
    )
  })

  it('falls back to firstRouteActionIndex when proxyNames are not yet loaded', () => {
    const emptyProxies = new Set<string>()
    assert.equal(
      isSingboxDnsRule(
        {
          payload: 'domain_suffix=example.com',
          proxy: 'dns_direct',
          rawProxy: 'route(dns_direct)',
        },
        emptyProxies,
        2,
        5,
      ),
      true,
    )
    assert.equal(
      isSingboxDnsRule(
        {
          payload: 'inbound=[dns-in dns-node-in]',
          proxy: 'hijack-dns',
          rawProxy: 'hijack-dns',
        },
        emptyProxies,
        5,
        5,
      ),
      true,
    )
    assert.equal(
      isSingboxDnsRule(
        {
          payload: 'ip_is_private=true',
          proxy: '🎯 全球直连',
          rawProxy: 'bypass(🎯 全球直连)',
        },
        emptyProxies,
        6,
        5,
      ),
      false,
    )
    assert.equal(
      isSingboxDnsRule(
        { payload: 'rule_set=Google', proxy: '❄ 谷歌服务', rawProxy: 'route(❄ 谷歌服务)' },
        emptyProxies,
        8,
        5,
      ),
      false,
    )
    assert.equal(
      isSingboxDnsRule(
        {
          payload: '',
          proxy: 'resolve(dns_proxy,match_only)',
          rawProxy: 'resolve(dns_proxy,match_only)',
        },
        emptyProxies,
        9,
        5,
      ),
      true,
    )
  })

  it('formats sing-box rules into Mihomo-style display fields', () => {
    assert.deepEqual(
      formatSingboxRule({
        type: 'default',
        payload: 'rule_set=Google',
        proxy: '❄ 谷歌服务',
        rawProxy: 'route(❄ 谷歌服务)',
      }),
      {
        displayType: 'RULE-SET',
        displayPayload: 'Google',
        actionLabel: undefined,
        optionsLabel: undefined,
        singleRuleSet: 'Google',
        isProxyTarget: true,
      },
    )

    assert.deepEqual(
      formatSingboxRule({
        type: 'default',
        payload: 'domain_suffix=[netflix.com nflxext.com]',
        proxy: 'sniff-override-destination',
        rawProxy: 'sniff-override-destination',
      }),
      {
        displayType: 'DOMAIN-SUFFIX',
        displayPayload: 'netflix.com, nflxext.com',
        actionLabel: 'sniff-override-destination',
        optionsLabel: undefined,
        singleRuleSet: undefined,
        isProxyTarget: false,
      },
    )

    assert.deepEqual(
      formatSingboxRule({
        type: 'default',
        payload: 'query_type=[A AAAA] clash_mode=Global',
        proxy: 'fake-ip-dns-server',
        rawProxy: 'route(fake-ip-dns-server,rewrite-ttl=60)',
      }),
      {
        displayType: 'AND',
        displayPayload: 'QUERY-TYPE=A, AAAA && CLASH-MODE=Global',
        actionLabel: undefined,
        optionsLabel: 'rewrite-ttl=60',
        singleRuleSet: undefined,
        isProxyTarget: true,
      },
    )

    assert.deepEqual(
      formatSingboxRule({
        type: 'default',
        payload: '',
        proxy: 'resolve(dns_proxy,match_only)',
        rawProxy: 'resolve(dns_proxy,match_only)',
      }),
      {
        displayType: 'MATCH',
        displayPayload: '',
        actionLabel: 'resolve',
        optionsLabel: 'dns_proxy, match_only',
        singleRuleSet: undefined,
        isProxyTarget: false,
      },
    )

    assert.deepEqual(
      formatSingboxRule({
        type: 'logical',
        payload:
          'network=tcp port=80 && !(source_ip_cidr=192.168.0.0/16 || rule_set=[telegram_ip cnip])',
        proxy: 'sniff(http,300ms)',
        rawProxy: 'sniff(http,300ms)',
      }),
      {
        displayType: 'LOGICAL',
        displayPayload:
          'network=tcp port=80 && !(source_ip_cidr=192.168.0.0/16 || rule_set=[telegram_ip, cnip])',
        actionLabel: 'sniff',
        optionsLabel: 'http, 300ms',
        singleRuleSet: undefined,
        isProxyTarget: false,
      },
    )
  })

  it('formats sing-box connection rules cleanly', () => {
    assert.equal(
      formatSingboxConnectionRule('rule_set=Google => route(❄ 谷歌服务)'),
      'RULE-SET: Google',
    )
    assert.equal(
      formatSingboxConnectionRule('ip_is_private=true => bypass(🎯 全球直连)'),
      'IP-PRIVATE: true',
    )
    assert.equal(formatSingboxConnectionRule('port=53 => hijack-dns'), 'DST-PORT: 53 => hijack-dns')
    assert.equal(formatSingboxConnectionRule(' => route(🚀 节点选择)'), 'MATCH')
    assert.equal(formatSingboxConnectionRule('final'), 'final')
  })
})
