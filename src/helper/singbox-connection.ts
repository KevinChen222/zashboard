import type { ClashConnectionRawMessage } from '../types'

type ClashConnectionNetworkMeta = Pick<
  ClashConnectionRawMessage['metadata'],
  'destinationPort' | 'sniffHost' | 'network'
>

type ClashConnectionTypeMeta = ClashConnectionNetworkMeta &
  Pick<ClashConnectionRawMessage['metadata'], 'type'>

export const getClashConnectionNetwork = (metadata: ClashConnectionNetworkMeta): string => {
  const { destinationPort, sniffHost, network } = metadata

  if ((destinationPort === '443' || sniffHost) && network === 'udp') {
    return 'quic'
  }

  return network
}

export const formatClashConnectionNetworkType = (
  metadata: ClashConnectionTypeMeta,
  isSingbox: boolean,
): string => {
  const network = (getClashConnectionNetwork(metadata) || '').trim()
  const type = (metadata.type || '').trim()

  if (isSingbox) {
    return network || type
  }

  return type ? `${type} | ${network}` : network
}
