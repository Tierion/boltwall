import { LndRequest, InvoiceResponse } from '.'

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
export type CaveatGetter = (req: LndRequest, invoice: InvoiceResponse) => string

/**
 * Describes a function that will verify macaroons. This will be run against
 * all caveats attached to a macaroon when a request for protected content is made and
 * will only be run when a given invoice has been paid. Each caveat attached to a macaroon
 * is passed through this function. When a match is found, the macaroon passes (for that caveat).
 * If none pass, then the macaroon is automatically invalid. The
 * [macaroons.js package]{@link https://www.npmjs.com/package/macaroons.js} comes with a built-in
 * verifier that can be used to verify the time example given in {@link CaveatGetter}, called
 * [`TimestampCaveatVerifier`]{@link https://github.com/nitram509/macaroons.js/blob/03f4ad1d30ccb0ccf67b771613474b74341a658c/lib/verifier/TimestampCaveatVerifier.js}
 */
export type CaveatVerifier = (req: LndRequest, caveat: string) => boolean
