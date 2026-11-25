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

  it('splits live reF1nd/sing-box rules into DNS vs Route preserving hit order', () => {
    const proxyNames = new Set(['🎯 全球直连', '🚀 节点选择', '❄ 谷歌服务'])
    const sampleRules = [
      {
        type: 'default',
        payload: 'preferred_by=dns_hosts',
        proxy: 'dns_hosts',
        rawProxy: 'route(dns_hosts)',
      },
      {
        type: 'default',
        payload: 'domain_suffix=911-gt2-rs.com',
        proxy: 'dns_rlose',
        rawProxy: 'route(dns_rlose)',
      },
      {
        type: 'default',
        payload: 'query_type=[A AAAA] clash_mode=Global',
        proxy: 'fake-ip-dns-server',
        rawProxy: 'route(fake-ip-dns-server,rewrite-ttl=60)',
      },
      {
        type: 'default',
        payload: 'query_type=[HTTPS SVCB] clash_mode=Global',
        proxy: 'predefined(NOERROR)',
        rawProxy: 'predefined(NOERROR)',
      },
      {
        type: 'logical',
        payload: 'rule_set=fakeip-filter && rule_set=cn',
        proxy: 'dns_direct',
        rawProxy: 'route(dns_direct)',
      },
      {
        type: 'default',
        payload: 'inbound=[dns-in dns-node-in]',
        proxy: 'hijack-dns',
        rawProxy: 'hijack-dns',
      },
      {
        type: 'default',
        payload: 'ip_is_private=true',
        proxy: '🎯 全球直连',
        rawProxy: 'bypass(🎯 全球直连)',
      },
      {
        type: 'logical',
        payload:
          'network=tcp port=80 && !(source_ip_cidr=192.168.0.0/16 || rule_set=[telegram_ip cnip])',
        proxy: 'sniff(http,300ms)',
        rawProxy: 'sniff(http,300ms)',
      },
      {
        type: 'default',
        payload: 'rule_set=Google',
        proxy: '❄ 谷歌服务',
        rawProxy: 'route(❄ 谷歌服务)',
      },
      {
        type: 'default',
        payload: '',
        proxy: 'resolve(dns_proxy,match_only)',
        rawProxy: 'resolve(dns_proxy,match_only)',
      },
    ]

    const { dnsRules, routeRules } = splitSingboxRules(sampleRules, proxyNames)
    assert.equal(dnsRules.length, 5)
    assert.equal(routeRules.length, 5)
    assert.equal(dnsRules[0].payload, 'preferred_by=dns_hosts')
    assert.equal(dnsRules[4].payload, 'rule_set=fakeip-filter && rule_set=cn')
    assert.equal(routeRules[0].payload, 'inbound=[dns-in dns-node-in]')
    assert.equal(routeRules[4].rawProxy, 'resolve(dns_proxy,match_only)')
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
        { payload: 'rule_set=Google', proxy: '❄ 谷歌服务', rawProxy: 'route(❄ 谷歌服务)' },
        emptyProxies,
        8,
        5,
      ),
      false,
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
