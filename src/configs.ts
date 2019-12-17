/**
 * @file Exposes different useful configs that can be used out of the box
 * for various common use cases
 */
import { Request } from 'express'
import {
  BoltwallConfig,
  InvoiceResponse,
  CaveatGetter,
  DescriptionGetter,
} from './typings'
import { Caveat, satisfiers } from './lsat'

/**
 * Creates a general caveat where the macaroon this is attached to
 * will only be valid for a designated amount of time, based on the invoice
 * amount paid
 */
const getTimeCaveat: CaveatGetter = (
  _req: Request,
  invoice: InvoiceResponse
): string => {
  const amount =
    typeof invoice.amount === 'string'
      ? parseInt(invoice.amount, 10)
      : invoice.amount

  // amount is in satoshis which is equal to the amount of seconds paid for
  const milli: number = amount * 1000

  // add 200 milliseconds of "free time" as a buffer
  const time = Date.now() + milli + 200
  const caveat = new Caveat({ condition: 'expiration', value: time.toString() })
  return caveat.encode()
}

/**
 * Generates a descriptive invoice description indicating more information
 * about the circumstances the invoice was created under
 */
const getTimedInvoiceDescription: DescriptionGetter = (req: Request) => {
  let { time, title, appName } = req.body // time in seconds
  const { amount } = req.body

  let info
  if (!appName && !title) info = `${req.method} ${req.originalUrl}`
  else {
    if (!appName) appName = `[unknown application @ ${req.ip}]`
    if (!title) title = '[unknown data]'
    info = `${title} in ${appName}`
  }
  if (!time) time = amount

  return `Payment to access ${info} for ${time} seconds`
}

export const TIME_CAVEAT_CONFIGS: BoltwallConfig = {
  getCaveats: getTimeCaveat,
  caveatSatisfiers: satisfiers.expirationSatisfier,
  getInvoiceDescription: getTimedInvoiceDescription,
  minAmount: 1, // want this to make sure at least some amount is paid to create invoice
}
