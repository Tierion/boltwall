/**
 * @file Exposes custom configurations for a paywall that restricts
 * access based on time calculated according to the amount paid
 */

import { Request } from 'express'
import {
  BoltwallConfig,
  InvoiceResponse,
  CaveatGetter,
  DescriptionGetter,
} from '../typings'
import { Caveat, expirationSatisfier } from 'lsat-js'

const getSecondsToPayFor = (req: Request, amount: number): number => {
  let seconds
  if (req.boltwallConfig && req.boltwallConfig.rate) {
    // rate is expected to be in satoshis per second
    const rate = req.boltwallConfig.rate
    seconds = amount / rate
  } else {
    seconds = amount
  }

  return Math.ceil(seconds)
}
/**
 * @type {CaveatGetter}
 * @description Creates a general caveat where the macaroon this is attached to
 * will only be valid for a designated amount of time, based on the invoice
 * amount paid
 */
const getTimeCaveat: CaveatGetter = (
  req: Request,
  invoice: InvoiceResponse
): string => {
  const amount =
    typeof invoice.amount === 'string'
      ? parseInt(invoice.amount, 10)
      : invoice.amount

  // need to convert seconds to milliseconds
  let time = Date.now() + getSecondsToPayFor(req, amount) * 1000

  // add 200 milliseconds of "free time" as a buffer
  time += 200

  const caveat = new Caveat({
    condition: 'expiration',
    value: time.toString(),
  })
  return caveat.encode()
}

/**
 * @type {DescriptionGetter}
 * @description Generates an invoice description that provides more information
 * about the circumstances the invoice was created under. In this case
 * we return an invoice description indicating what is being paid for and the time
 * for access.
 */
const getTimedInvoiceDescription: DescriptionGetter = (req, tokens) => {
  let { time, title, appName } = req.body
  const { amount } = req.body

  let info
  if (!appName && !title) info = `${req.method} ${req.originalUrl}`
  else {
    if (!appName) appName = `[unknown application @ ${req.ip}]`
    if (!title) title = '[unknown data]'
    info = `${title} in ${appName}`
  }
  if (!time && tokens) time = getSecondsToPayFor(req, tokens)
  else if (!time && amount) time = amount

  return `Payment to access ${info} for ${time} seconds`
}

const TIME_CAVEAT_CONFIGS: BoltwallConfig = {
  getCaveats: getTimeCaveat,
  caveatSatisfiers: expirationSatisfier,
  getInvoiceDescription: getTimedInvoiceDescription,
  minAmount: 1, // want this to make sure at least some amount is paid to create invoice
}

export default TIME_CAVEAT_CONFIGS
