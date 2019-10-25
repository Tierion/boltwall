import { InvoiceResponse, LndRequest } from '.'

/**
 * Describes a function that returns a description string
 * for including in lightning invoices. Can use elements in the request
 * object to compose the description.
 * The example returns "Payment for 30 seconds of access."
 * @example
 * (req) => `Access for ${req.body.amount} seconds of access.`
 */
export type DescriptionGetter = (req: LndRequest) => Promise<string>

/**
 * Describes a function that will create a caveat to attach onto a discharge macaroon.
 * A caveat is just a string that can later be verified in the {@link CaveatVerifier}.
 * Because the macaroons are signed, this cannot be tampered with.
 * Learn more about macaroons in the documentation for the
 * [macaroons.js package]{@link https://www.npmjs.com/package/macaroons.js}
 * The following CaveatGetter would make a macaroon valid for 30000ms or 30 seconds
 * @example
 * () => `time < ${new Date(Date.now() + 30000)}`
 */
export type CaveatGetter = (
  req: LndRequest,
  invoice: InvoiceResponse
) => Promise<string> | string

/**
 * Describes a function that will verify macaroons. This will be run against
 * all caveats attached to a macaroon when a request for protected content is made and
 * will only be run when a given invoice has been paid. Each caveat attached to a macaroon
 * is passed through this function. When a match is found, the macaroon passes (for that caveat).
 * If none pass, then the macaroon is automatically invalid. The
 * [macaroons.js package]{@link https://www.npmjs.com/package/macaroons.js} comes with a built-in
 * verifier that can be used to verify the time example given in {@link CaveatGetter}, called
 * [`TimestampCaveatVerifier`]{@link https://github.com/nitram509/macaroons.js/blob/03f4ad1d30ccb0ccf67b771613474b74341a658c/lib/verifier/TimestampCaveatVerifier.js}.
 * Note that the AsyncCaveatVerifier actually should return a Promise that returns a function.
 * This allows us to take advantage of currying to make the request object available for the verification
 * of the caveat.
 * The following caveat verifier will return true for a caveat that includes the same host as the request
 * @example
 * (req) => Promise.resolve((caveat) => caveat.indexOf(req.host) > -1)
 */
export type AsyncCaveatVerifier = (req: LndRequest) => Promise<CaveatVerifier>

export type CaveatVerifier = (caveat: string) => boolean

/**
 * Describes a configuration object that can be passed to boltwall during initialization
 * to customize various aspects of the paywall functionality.
 */
export interface BoltwallConfig {
  getCaveat?: CaveatGetter
  caveatVerifier?: AsyncCaveatVerifier
  getInvoiceDescription?: DescriptionGetter
  minAmount?: string | number
}
