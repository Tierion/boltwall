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

export const secondInvoice = {
  payreq:
    'lntb10u1p0p702kpp5va6qv60l4g8phlf5vrhw7m9ug3myjgyz8ra4ftmw9qpvvkwl9acsdqvw3jhxarfdenscqzpgxqyz5vqch6txesggwdup2qhyzkve6zfrms44upxdhth9grw8jggg59uc79sdh7qmlfcte7z84n5hkns95frq8z64f8dlce7vxq86vyahttal4spzqusxc',
  secret: '2e5230eb0ce19caff7987e26f13eb706ea134c7207032c01985f43afbc9e51e3',
  paymentHash:
    '67740669ffaa0e1bfd3460eeef6cbc447649208238fb54af6e2802c659df2f71',
}

export const invoiceDetails = parsePaymentRequest({ request: invoice.payreq })

export const challenge = {
  signature:
    '9d6667dcac8aeab5f5b1ece3fdf6f63d98a5206e622d193b11b4c289849d4f04483f298aa4c202faa3df738ed65eced77a72ccaad3abdef75c5cbae04cb36718',
  challenge: '34e3536072796350ff184dbf04110c8720a3ca537999fd1e49849d1ca4706b02',
  pubkey: '023d489f8d4b91d66e4950acd1cdbc926212495477f84323168272e271f7445dcd',
}

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
  id: invoiceDetails.id,
  secret: invoice.secret,
  tokens: invoiceDetails.tokens,
  created_at: '2016-08-29T09:12:33.001Z',
  description: invoiceDetails.description,
}
