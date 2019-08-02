import { LndRequest, InvoiceResponse } from '.'

export type CaveatGetter = (req: LndRequest, invoice: InvoiceResponse) => string

export type CaveatVerifier = (req: LndRequest, caveat: string) => boolean
