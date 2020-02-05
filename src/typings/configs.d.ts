import { Request } from 'express'
import { InvoiceResponse } from '.'
import { Satisfier } from 'lsat-js'

/**
 * Describes a function that returns a description string
 * for including in lightning invoices. Can use elements in the request
 * object to compose the description.
 * The example returns "Payment for 30 seconds of access."
 * @example
 * (req) => `Access for ${req.body.amount} seconds of access.`
 */
export type DescriptionGetter = (req: Request) => string

/**
 * Describes a function that will create a caveat to attach onto a discharge macaroon.
 * A caveat is just a string that can later be verified in the {@link CaveatSatisfiers}.
 * Because the macaroons are signed, this cannot be tampered with.
 * Learn more about macaroons in the documentation for the
 * [macaroons.js package]{@link https://www.npmjs.com/package/macaroons.js}
 * The following CaveatGetter would make a macaroon valid for 30000ms or 30 seconds
 * @example
 * () => `time < ${new Date(Date.now() + 30000)}`
 */
export type CaveatGetter = (req: Request, invoice: InvoiceResponse) => string

/**
 * Describes a configuration object that can be passed to boltwall during initialization
 * to customize various aspects of the paywall functionality.
 */
export interface BoltwallConfig {
  getCaveats?: CaveatGetter | CaveatGetter[]
  caveatSatisfiers?: Satisfier | Satisfier[]
  getInvoiceDescription?: DescriptionGetter
  minAmount?: string | number
  hodl?: boolean
  oauth?: boolean
  rate?: number
}
