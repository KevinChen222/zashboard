import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { LOG_LEVEL } from '../src/constant'
import {
  extractSingboxDisplayLogType,
  getSingboxConnectionId,
  simplifySingboxInfoLogs,
  stripAnsiCodes,
} from '../src/helper/singbox-log-core.ts'
import type { LogWithSeq } from '../src/types'

let nextSeq = 1

const makeLog = (
  payload: string,
  type: LOG_LEVEL = 'info' as LOG_LEVEL,
  time = '00:55:48',
): LogWithSeq => ({
  seq: nextSeq++,
  time,
  type,
  payload,
})

// Helper that takes chronological (oldest -> newest) entries and returns newest-first array
// matching src/assembly/logs.ts (pending.unshift).
const newestFirst = (...entries: LogWithSeq[]): LogWithSeq[] => [...entries].reverse()

describe('singbox-log-core', () => {
  it('hides dns-in, dns-node-in, rpcd process, and dns cached/exchanged/optimistic/refreshed noise', () => {
    const raw = newestFirst(
      makeLog(
        '[3764138073 0ms] inbound/direct[dns-in]: inbound packet connection from 127.0.0.1:42116',
      ),
      makeLog('[3764138073 0ms] inbound/direct[dns-in]: inbound packet connection to [::]:1053'),
      makeLog('[3764138073 8ms] router: found process path: /sbin/rpcd, user: root'),
      makeLog(
        '[3764138073 9ms] dns: cached SOA 10.in-addr.arpa. 436 IN SOA 10.in-addr.arpa. . 0 28800 7200 604800 86400',
      ),
      makeLog(
        '[3764138073 10ms] dns: cached OPT OPT PSEUDOSECTION: EDNS: version 0 flags: udp: 1232',
      ),
      makeLog(
        '[3872543807 0ms] inbound/direct[dns-node-in]: inbound packet connection from 127.0.0.1:46481',
      ),
      makeLog(
        '[3872543807 0ms] inbound/direct[dns-node-in]: inbound packet connection to 127.0.0.1:1054',
      ),
      makeLog('[3872543807 0ms] router: found process path: /usr/bin/sing-box, user: root'),
      makeLog('[3872543807 1ms] dns: optimistic A node-entry.example.qpon. 1 IN A 198.51.100.107'),
      makeLog(
        'dns: refreshed SOA 168.192.in-addr.arpa. 2399 IN SOA 168.192.in-addr.arpa. . 0 28800 7200 604800 86400',
      ),
      makeLog(
        '[1220666231 0ms] inbound/direct[dns-in]: inbound packet connection from 192.168.2.115:43427',
      ),
      makeLog('[1220666231 0ms] inbound/direct[dns-in]: inbound packet connection to [::]:1053'),
      makeLog('[1220666231 0ms] router: found neighbor: 90:2e:16:7f:1e:05, hostname: kevinchen'),
      makeLog('[1220666231 1ms] dns: exchanged A chatgpt.com. 60 IN A 198.18.0.45'),
      makeLog('[1220666231 1ms] dns: exchanged AAAA chatgpt.com. 60 IN AAAA fc00::2a'),
    )

    assert.deepEqual(simplifySingboxInfoLogs(raw), [])
  })

  it('correlates chained/detour TCP connection with neighbor hostname and folds relay hop', () => {
    const primaryOutbound = makeLog(
      '[1401771270 2ms] outbound/shadowsocks[美洲落地/🇺🇸 德州家宽 t1转发]: outbound connection to chatgpt.com:443',
    )
    const raw = newestFirst(
      makeLog(
        '[1401771270 0ms] inbound/redirect[redirect-in]: inbound connection from 192.168.2.115:44974',
      ),
      makeLog(
        '[1401771270 0ms] inbound/redirect[redirect-in]: inbound connection to 198.18.0.45:443',
      ),
      makeLog('[1401771270 0ms] router: found neighbor: 90:2e:16:7f:1e:05, hostname: kevinchen'),
      primaryOutbound,
      makeLog(
        '[1401771270 2ms] outbound/anytls[主用机场/🇯🇵 日本 06 GSL]: outbound connection to 174.136.206.114:21230',
      ),
    )

    const result = simplifySingboxInfoLogs(raw)
    assert.equal(result.length, 1)
    assert.equal(result[0].seq, primaryOutbound.seq)
    assert.equal(result[0].connectionId, '1401771270')
    assert.equal(
      result[0].payload,
      '[TCP] 192.168.2.115 (kevinchen):44974 --> chatgpt.com:443 using 美洲落地/🇺🇸 德州家宽 t1转发 (via 主用机场/🇯🇵 日本 06 GSL)',
    )
  })

  it('supports multi-hop detour chains and omits hostname when neighbor has MAC only', () => {
    const raw = newestFirst(
      makeLog(
        '[3757674340 0ms] inbound/redirect[redirect-in]: inbound connection from 192.168.2.137:46426',
      ),
      makeLog(
        '[3757674340 0ms] inbound/redirect[redirect-in]: inbound connection to 198.18.0.144:443',
      ),
      makeLog('[3757674340 0ms] router: found neighbor: 9c:73:b1:ca:55:d5'),
      makeLog(
        '[3757674340 7ms] outbound/shadowsocks[香港落地/🇭🇰 CMHK 12.16]: outbound connection to z-m-gateway.facebook.com:443',
      ),
      makeLog(
        '[3757674340 7ms] outbound/shadowsocks[主用机场/香港A07 | x0.8]: outbound connection to relay-exit.example.com:26655',
      ),
      makeLog(
        '[3757674340 8ms] outbound/direct[direct-v4]: outbound connection to 203.0.113.10:443',
      ),
    )

    const result = simplifySingboxInfoLogs(raw)
    assert.equal(result.length, 1)
    assert.equal(
      result[0].payload,
      '[TCP] 192.168.2.137:46426 --> z-m-gateway.facebook.com:443 using 香港落地/🇭🇰 CMHK 12.16 (via 主用机场/香港A07 | x0.8 -> direct-v4)',
    )
  })

  it('correlates tproxy UDP packet connection where outbound line omits destination', () => {
    const raw = newestFirst(
      makeLog(
        '[3350091496 0ms] inbound/tproxy[tproxy-in]: inbound packet connection from 192.168.2.203:52500',
      ),
      makeLog(
        '[3350091496 0ms] inbound/tproxy[tproxy-in]: inbound packet connection to 183.47.107.174:22000',
      ),
      makeLog(
        '[3350091496 0ms] router: found neighbor: 0c:bd:75:f1:19:09, hostname: OPPO-Pad-4-Pro',
      ),
      makeLog('[3350091496 0ms] outbound/direct[direct-v6]: outbound packet connection'),
    )

    const result = simplifySingboxInfoLogs(raw)
    assert.equal(result.length, 1)
    assert.equal(result[0].connectionId, '3350091496')
    assert.equal(
      result[0].payload,
      '[UDP] 192.168.2.203 (OPPO-Pad-4-Pro):52500 --> 183.47.107.174:22000 using direct-v6',
    )
  })

  it('handles IPv6 sources with and without hostname and IPv6 destinations', () => {
    const raw = newestFirst(
      makeLog(
        '[3626372295 0ms] inbound/redirect[redirect-in]: inbound connection from [fdaa:9954:f229:0:11b5:2757:e26c:4720]:46990',
      ),
      makeLog(
        '[3626372295 0ms] inbound/redirect[redirect-in]: inbound connection to [fc00::92]:443',
      ),
      makeLog('[3626372295 0ms] router: found neighbor: 9c:73:b1:ca:55:d5'),
      makeLog(
        '[3626372295 2ms] outbound/shadowsocks[美洲落地/🇺🇸 德州家宽 t1转发]: outbound connection to android.apis.google.com:443',
      ),
      makeLog(
        '[3626372295 2ms] outbound/anytls[主用机场/🇯🇵 日本 06 GSL]: outbound connection to 174.136.206.114:21230',
      ),
      makeLog(
        '[3626372296 0ms] inbound/tproxy[tproxy-in]: inbound packet connection from [fdaa:9954:f229::10]:53000',
      ),
      makeLog(
        '[3626372296 0ms] inbound/tproxy[tproxy-in]: inbound packet connection to [2606:4700:4700::1111]:443',
      ),
      makeLog('[3626372296 0ms] router: found neighbor: 90:2e:16:7f:1e:05, hostname: kevinchen'),
      makeLog('[3626372296 1ms] outbound/direct[direct-v6]: outbound packet connection'),
    )

    const result = simplifySingboxInfoLogs(raw)
    assert.equal(result.length, 2)
    assert.equal(
      result[0].payload,
      '[UDP] [fdaa:9954:f229::10] (kevinchen):53000 --> [2606:4700:4700::1111]:443 using direct-v6',
    )
    assert.equal(
      result[1].payload,
      '[TCP] [fdaa:9954:f229:0:11b5:2757:e26c:4720]:46990 --> android.apis.google.com:443 using 美洲落地/🇺🇸 德州家宽 t1转发 (via 主用机场/🇯🇵 日本 06 GSL)',
    )
  })

  it('preserves Zashboard sourceIPLabelList labels without duplicating neighbor hostname', () => {
    const raw = newestFirst(
      makeLog(
        '[1401771271 0ms] inbound/redirect[redirect-in]: inbound connection from 192.168.2.115 (MacBook) :44974',
      ),
      makeLog('[1401771271 0ms] router: found neighbor: 90:2e:16:7f:1e:05, hostname: kevinchen'),
      makeLog('[1401771271 2ms] outbound/direct[direct-v4]: outbound connection to github.com:443'),
      makeLog(
        '[1401771272 0ms] inbound/redirect[redirect-in]: inbound connection from [fdaa:9954:f229::1] (iPhone) :51234',
      ),
      makeLog('[1401771272 0ms] router: found neighbor: 9c:73:b1:ca:55:d5, hostname: iphone-lan'),
      makeLog('[1401771272 2ms] outbound/direct[direct-v6]: outbound connection to apple.com:443'),
    )

    const result = simplifySingboxInfoLogs(raw)
    assert.equal(result.length, 2)
    assert.equal(
      result[0].payload,
      '[TCP] [fdaa:9954:f229::1] (iPhone):51234 --> apple.com:443 using direct-v6',
    )
    assert.equal(
      result[1].payload,
      '[TCP] 192.168.2.115 (MacBook):44974 --> github.com:443 using direct-v4',
    )
  })

  it('suppresses mid-connection DNS lookups sharing a TCP traffic connID', () => {
    const raw = newestFirst(
      makeLog(
        '[1009970989 0ms] inbound/redirect[redirect-in]: inbound connection from 192.168.2.137:43230',
      ),
      makeLog(
        '[1009970989 0ms] inbound/redirect[redirect-in]: inbound connection to 198.18.1.75:443',
      ),
      makeLog('[1009970989 0ms] router: found neighbor: 9c:73:b1:ca:55:d5'),
      makeLog(
        '[1009970989 59ms] dns: exchanged AAAA qbrere.cdn-settings.appsflyersdk.com. 14 IN AAAA 2600:9000:2939:6c00:f:3bf0:f080:93a1',
      ),
      makeLog(
        '[1009970989 61ms] dns: exchanged A qbrere.cdn-settings.appsflyersdk.com. 60 IN A 3.175.214.112',
      ),
      makeLog(
        '[1009970989 61ms] dns: lookup succeed for qbrere.cdn-settings.appsflyersdk.com: 3.175.214.112',
      ),
      makeLog(
        '[1009970989 61ms] outbound/shadowsocks[美洲落地/🇺🇸 德州家宽 t1转发]: outbound connection to qbrere.cdn-settings.appsflyersdk.com:443',
      ),
      makeLog(
        '[1009970989 61ms] outbound/anytls[主用机场/🇯🇵 日本 06 GSL]: outbound connection to 174.136.206.114:21230',
      ),
    )

    const result = simplifySingboxInfoLogs(raw)
    assert.equal(result.length, 1)
    assert.equal(
      result[0].payload,
      '[TCP] 192.168.2.137:43230 --> qbrere.cdn-settings.appsflyersdk.com:443 using 美洲落地/🇺🇸 德州家宽 t1转发 (via 主用机场/🇯🇵 日本 06 GSL)',
    )
  })

  it('hides healthcheck/urltest probes without connID while preserving lifecycle info logs', () => {
    const started = makeLog('sing-box started (0.24s)')
    const clashApi = makeLog('clash-api: restful api listening at 127.0.0.1:9096')
    const inboundStarted = makeLog('inbound/mixed[mixed-in]: tcp server started at 127.0.0.1:7890')

    const raw = newestFirst(
      started,
      clashApi,
      inboundStarted,
      makeLog(
        'outbound/trojan[主用机场/🇸🇬 FLOWER-SG-SHCU-03]: outbound connection to cp.cloudflare.com:80',
      ),
      makeLog('outbound/vless[主用机场/🇯🇵 zouter v4]: outbound connection to cp.cloudflare.com:80'),
      makeLog(
        'outbound/anytls[主用机场/🇯🇵 Viking 日本 MPLS 专线2]: outbound connection to www.gstatic.com:443',
      ),
      makeLog('outbound/urltest[⭐ 日本自动]: selected 主用机场/🇯🇵 日本 06 GSL'),
      makeLog('dns: refreshed A node.example.com. 29 IN A 198.51.100.1'),
    )

    const result = simplifySingboxInfoLogs(raw)
    assert.deepEqual(
      result.map((log) => log.payload),
      [inboundStarted.payload, clashApi.payload, started.payload],
    )
  })

  it('never hides or rewrites warning, error, fatal, panic, debug, or trace logs', () => {
    const warnDns = makeLog(
      '[101 2ms] dns: lookup failed for bad.invalid: nxdomain',
      'warning' as LOG_LEVEL,
    )
    const errOutbound = makeLog(
      '[102 5ms] outbound/shadowsocks[nodeA]: dial tcp timeout',
      'error' as LOG_LEVEL,
    )
    const fatalLog = makeLog('fatal startup error', 'fatal' as LOG_LEVEL)
    const panicLog = makeLog('panic: unexpected nil pointer', 'panic' as LOG_LEVEL)
    const debugLog = makeLog('[103 0ms] dns: cached A example.com.', 'debug' as LOG_LEVEL)
    const traceLog = makeLog(
      '[104 0ms] router: found neighbor: 00:11:22:33:44:55',
      'trace' as LOG_LEVEL,
    )

    const raw = newestFirst(warnDns, errOutbound, fatalLog, panicLog, debugLog, traceLog)
    const result = simplifySingboxInfoLogs(raw)

    assert.equal(result.length, 6)
    assert.deepEqual(result, raw)
  })

  it('parses ANSI-colored payloads cleanly and extracts connection IDs', () => {
    const ansiInbound =
      '\u001B[36m[555123 0ms]\u001B[0m inbound/redirect[redirect-in]: inbound connection from 192.168.2.50:60000'
    const ansiOutbound =
      '\u001B[36m[555123 3ms]\u001B[0m outbound/vless[机场 [VIP] 01]: outbound connection to example.org:443'

    assert.equal(
      stripAnsiCodes(ansiInbound),
      '[555123 0ms] inbound/redirect[redirect-in]: inbound connection from 192.168.2.50:60000',
    )
    assert.equal(getSingboxConnectionId(ansiInbound), '555123')

    const raw = newestFirst(makeLog(ansiInbound), makeLog(ansiOutbound))
    const result = simplifySingboxInfoLogs(raw)

    assert.equal(result.length, 1)
    assert.equal(result[0].connectionId, '555123')
    assert.equal(
      result[0].payload,
      '[TCP] 192.168.2.50:60000 --> example.org:443 using 机场 [VIP] 01',
    )
  })

  it('handles reject/block actions, sniffed domain override on FakeIP, and suppresses outbound/dns', () => {
    const raw = newestFirst(
      // Rejected connection with FakeIP + sniffed domain
      makeLog(
        '[8001 0ms] inbound/redirect[redirect-in]: inbound connection from 192.168.2.88:50001',
      ),
      makeLog('[8001 0ms] inbound/redirect[redirect-in]: inbound connection to 198.18.0.99:443'),
      makeLog('[8001 1ms] router: sniffed protocol: tls, domain: ads.tracker.example'),
      makeLog('[8001 1ms] router: rejected'),
      // Legacy outbound/block
      makeLog(
        '[8002 0ms] inbound/redirect[redirect-in]: inbound connection from 192.168.2.88:50002',
      ),
      makeLog('[8002 1ms] outbound/block[adblock]: blocked connection to ad.doubleclick.net:443'),
      // Legacy outbound/dns hijack -> should be suppressed
      makeLog(
        '[8003 0ms] inbound/tproxy[tproxy-in]: inbound packet connection from 192.168.2.88:50003',
      ),
      makeLog('[8003 0ms] inbound/tproxy[tproxy-in]: inbound packet connection to 8.8.8.8:53'),
      makeLog('[8003 1ms] outbound/dns[dns-out]: outbound packet connection to 8.8.8.8:53'),
      // dns-in triggering an outbound -> should be suppressed
      makeLog('[8004 0ms] inbound/direct[dns-in]: inbound packet connection from 127.0.0.1:40000'),
      makeLog('[8004 1ms] outbound/direct[direct-v4]: outbound packet connection to 223.5.5.5:53'),
    )

    const result = simplifySingboxInfoLogs(raw)
    assert.equal(result.length, 2)
    assert.equal(
      result[0].payload,
      '[TCP] 192.168.2.88:50002 --> ad.doubleclick.net:443 using adblock',
    )
    assert.equal(
      result[1].payload,
      '[TCP] 192.168.2.88:50001 --> ads.tracker.example:443 using REJECT',
    )
  })

  it('gracefully formats connections when inbound lines were evicted from log buffer', () => {
    const raw = newestFirst(
      makeLog('[9001 2ms] outbound/shadowsocks[exit-us]: outbound connection to openai.com:443'),
      makeLog('[9001 2ms] outbound/anytls[relay-jp]: outbound connection to 198.51.100.20:443'),
      makeLog('[9002 0ms] outbound/direct[direct-v6]: outbound packet connection'),
    )

    const result = simplifySingboxInfoLogs(raw)
    assert.equal(result.length, 2)
    assert.equal(result[0].payload, '[UDP] using direct-v6')
    assert.equal(result[1].payload, '[TCP] --> openai.com:443 using exit-us (via relay-jp)')
  })

  it('returns raw logs untouched when toggle is disabled', () => {
    const raw = newestFirst(
      makeLog(
        '[3764138073 0ms] inbound/direct[dns-in]: inbound packet connection from 127.0.0.1:42116',
      ),
      makeLog('[3764138073 9ms] dns: cached SOA 10.in-addr.arpa.'),
    )

    assert.equal(simplifySingboxInfoLogs(raw, false), raw)
  })

  it('extracts concise display log types for toolbar type filter dropdown', () => {
    assert.equal(
      extractSingboxDisplayLogType('[TCP] 192.168.2.115:44974 --> chatgpt.com:443 using direct-v4'),
      '[TCP]',
    )
    assert.equal(
      extractSingboxDisplayLogType('[UDP] 192.168.2.203:52500 --> 1.1.1.1:443 using direct-v6'),
      '[UDP]',
    )
    assert.equal(
      extractSingboxDisplayLogType('[1401771270 5ms] outbound/shadowsocks[node]: dial timeout'),
      'outbound/shadowsocks[node]:',
    )
    assert.equal(
      extractSingboxDisplayLogType('clash-api: restful api listening at 127.0.0.1:9096'),
      'clash-api:',
    )
    assert.equal(extractSingboxDisplayLogType('sing-box started (0.24s)'), 'sing-box')
  })
})
