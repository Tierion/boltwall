import { CaveatGetter, CaveatVerifier, LndRequest } from '.'

/**
 * Describes a function that returns a description string
 * for including in lightning invoices. Can use elements in the request
 * object to compose the description.
 * The example returns "Payment for 30 seconds of access."
 * @example
 * (req) => `Access for ${req.body.amount} seconds of access.`
 */
export type DescriptionGetter = (req: LndRequest) => string

export interface BoltwallConfig {
  getCaveat?: CaveatGetter
  caveatVerifier?: CaveatVerifier
  getInvoiceDescription?: DescriptionGetter
}
