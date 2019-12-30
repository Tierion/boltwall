import { parsePaymentRequest } from 'ln-service'

export const nodeInfo = {
  alias: 'alice',
  best_header_timestamp: Math.round(Date.now() / 1000),
  block_hash: Buffer.alloc(32).toString('hex'),
  block_height: 100,
  chains: [],
  color: '#000000',
  public_key: Buffer.alloc(33).toString('hex'),
  active_channels_count: 1,
  peers_count: 1,
  num_pending_channels: 1,
  synced_to_chain: true,
  version: 'version',
  uris: [''],
}

nodeInfo.uris = [`${nodeInfo.public_key}@127.0.0.1:19735`]

export const invoice = {
  payreq:
    'lntb10u1pw7kfm8pp50nhe8uk9r2n9yz97c9z8lsu0ckxehnsnwkjn9mdsmnf' +
    'fpgkrxzhqdq5w3jhxapqd9h8vmmfvdjscqzpgllq2qvdlgkllc27kpd87lz8p' +
    'dfsfmtteyc3kwq734jpwnvqt96e4nuy0yauzdrtkumxsvawgda8dlljxu3nnj' +
    'lhs6w75390wy7ukj6cpfmygah',
  secret: '2ca931a1c36b48f54948b898a271a53ed91ff7d0081939a5fa511249e81cba5c',
}

const request = parsePaymentRequest({ request: invoice.payreq })

export interface InvoiceResponseStub {
  request: string
  is_confirmed: boolean
  is_held?: boolean | undefined
  id: string
  secret: string
  tokens: number
  created_at: string
  description: string
}

export const invoiceResponse: InvoiceResponseStub = {
  request: invoice.payreq,
  is_confirmed: true,
  id: request.id,
  secret: invoice.secret,
  tokens: request.tokens,
  created_at: '2016-08-29T09:12:33.001Z',
  description: request.description,
}
