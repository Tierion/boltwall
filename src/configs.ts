/**
 * @file Exposes different useful configs that can be used out of the box
 * for various common use cases
 */

import {
  BoltwallConfig,
  LndRequest,
  InvoiceResponse,
  CaveatGetter,
  CaveatVerifier,
  DescriptionGetter,
} from './typings'
const { verifier } = require('macaroons.js')

/**
 * Creates a general caveat where the macaroon this is attached to
 * will only be valid for a designated amount of time, based on the invoice
 * amount paid
 */
const getTimeCaveat: CaveatGetter = (
  _req: LndRequest,
  invoice: InvoiceResponse
) => {
  const amount =
    typeof invoice.amount === 'string'
      ? parseInt(invoice.amount, 10)
      : invoice.amount

  // amount is in satoshis which is equal to the amount of seconds paid for
  const milli: number = amount * 1000

  // add 200 milliseconds of "free time" as a buffer
  const time = new Date(Date.now() + milli + 200)
  return `time < ${time}`
}

/**
 * This example caveatVerifier method simply implements the
 * built in TimestamCaveatVerifier available in the macaroons.js pacakge
 */
const verifyTimeCaveat: CaveatVerifier = (_req: LndRequest, caveat: string) =>
  verifier.TimestampCaveatVerifier(caveat)

/**
 * Generates a descriptive invoice description indicating more information
 * about the circumstances the invoice was created under
 */
const getTimedInvoiceDescription: DescriptionGetter = (req: LndRequest) => {
  let { time, title, appName, amount } = req.body // time in seconds

  if (!appName) appName = `[unknown application @ ${req.ip}]`
  if (!title) title = '[unknown data]'
  if (!time) time = amount

  return `Access for ${time} seconds in ${appName} for requested data: ${title}`
}

export const TIME_CAVEAT_CONFIGS: BoltwallConfig = {
  getCaveat: getTimeCaveat,
  caveatVerifier: verifyTimeCaveat,
  getInvoiceDescription: getTimedInvoiceDescription,
}
