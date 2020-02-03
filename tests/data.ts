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
    'rbignb8wwippon1fjfc8cjr4sbunsefmh1ctqbp3jauqs11zhjrqejbmmbduo3iqo5xxfrrqum4azz9icnp4b8fqj43gsa5nxq6c7o55',
  challenge: '0c71cf8d193befcee5710ffa684a363d4ed67e87e6cab79a6354d140b428556d',
  pubkey: '032978752d52ee481e626bb24a4edae11142af7ea25e2337ce9ea786e7dbc95316',
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
