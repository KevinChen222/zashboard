import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatClashConnectionNetworkType,
  getClashConnectionNetwork,
} from '../src/helper/singbox-connection.ts'

describe('singbox-connection helper', () => {
  it('detects quic for udp traffic on port 443 or with sniffHost', () => {
    assert.equal(
      getClashConnectionNetwork({
        network: 'tcp',
        destinationPort: '443',
        sniffHost: 'example.com',
      }),
      'tcp',
    )
    assert.equal(
      getClashConnectionNetwork({ network: 'udp', destinationPort: '53', sniffHost: '' }),
      'udp',
    )
    assert.equal(
      getClashConnectionNetwork({ network: 'udp', destinationPort: '443', sniffHost: '' }),
      'quic',
    )
    assert.equal(
      getClashConnectionNetwork({
        network: 'udp',
        destinationPort: '8443',
        sniffHost: 'example.com',
      }),
      'quic',
    )
  })

  it('formats sing-box connection type as protocol only without inbound type/tag prefix', () => {
    assert.equal(
      formatClashConnectionNetworkType(
        { type: 'tun/tun-in', network: 'tcp', destinationPort: '443', sniffHost: '' },
        true,
      ),
      'tcp',
    )
    assert.equal(
      formatClashConnectionNetworkType(
        { type: 'redirect/redirect-in', network: 'tcp', destinationPort: '80', sniffHost: '' },
        true,
      ),
      'tcp',
    )
    assert.equal(
      formatClashConnectionNetworkType(
        { type: 'tproxy/tproxy-in', network: 'udp', destinationPort: '5353', sniffHost: '' },
        true,
      ),
      'udp',
    )
    assert.equal(
      formatClashConnectionNetworkType(
        { type: 'tun/tun-in', network: 'udp', destinationPort: '443', sniffHost: 'google.com' },
        true,
      ),
      'quic',
    )
    assert.equal(
      formatClashConnectionNetworkType(
        { type: 'Inner', network: 'tcp', destinationPort: '', sniffHost: '' },
        true,
      ),
      'tcp',
    )
    assert.equal(
      formatClashConnectionNetworkType(
        { type: 'tun/tun-in', network: '', destinationPort: '', sniffHost: '' },
        true,
      ),
      'tun/tun-in',
    )
  })

  it('preserves Mihomo "type | network" display format when core is not sing-box', () => {
    assert.equal(
      formatClashConnectionNetworkType(
        { type: 'TUN', network: 'tcp', destinationPort: '443', sniffHost: '' },
        false,
      ),
      'TUN | tcp',
    )
    assert.equal(
      formatClashConnectionNetworkType(
        { type: 'HTTPS', network: 'tcp', destinationPort: '443', sniffHost: '' },
        false,
      ),
      'HTTPS | tcp',
    )
    assert.equal(
      formatClashConnectionNetworkType(
        { type: 'TProxy', network: 'udp', destinationPort: '443', sniffHost: '' },
        false,
      ),
      'TProxy | quic',
    )
    assert.equal(
      formatClashConnectionNetworkType(
        { type: 'Inner', network: 'tcp', destinationPort: '', sniffHost: '' },
        false,
      ),
      'Inner | tcp',
    )
    assert.equal(
      formatClashConnectionNetworkType(
        { type: '', network: 'tcp', destinationPort: '80', sniffHost: '' },
        false,
      ),
      'tcp',
    )
  })
})
