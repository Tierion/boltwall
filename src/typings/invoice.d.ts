export interface InvoiceResponse {
  payreq: string
  id: string
  description?: string
  createdAt: string
  amount: string | number
  status?: string
  secret?: string
}

export interface LnServiceInvoiceResponse {
  chain_address: string
  confirmed_at?: string
  created_at: string
  description: string
  description_hash?: string
  expires_at: string
  id: string
  is_canceled?: boolean
  is_confirmed: boolean
  is_held?: boolean
  is_outgoing: boolean
  is_private: boolean
  payments: object[]
  received: number
  received_mtokens: number
  request: string
  secret: string
  tokens: number
}
