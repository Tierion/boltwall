import { Response, NextFunction } from 'express'
import Macaroon from 'macaroons.js/lib/Macaroon'

import {
  getFirstPartyCaveatFromMacaroon,
  checkInvoiceStatus,
  getDischargeMacaroon,
  getFirstPartyCaveat,
  validateMacaroons,
  getLocation,
} from '../helpers'
import { LndRequest } from '../typings'

export default async function boltwall(
  req: LndRequest,
  res: Response,
  next: NextFunction
): Promise<any> {
  console.log(
    'Checking if the request has been authorized or still requires payment...'
  )

  const location: string = getLocation(req)

  let rootMacaroon: Macaroon | undefined
  if (req.session) rootMacaroon = req.session.macaroon

  // if there is no macaroon at all
  // then just return a 402: Payment Required
  if (!rootMacaroon)
    return res
      .status(402)
      .json({ message: 'Payment required to access content.' })

  // if there is a root macaroon
  // check that we also have the discharge macaroon passed either in request query or a session cookie
  let dischargeMacaroon =
    req.query.dischargeMacaroon ||
    (req.session && req.session.dischargeMacaroon)

  // need the invoiceId, either from the req query or from the root macaroon
  // we'll leave the retrieval from the req.query in case we end up updating the
  // the first party caveat in the future or adding flexibility to it.
  let invoiceId = req.query.id
  if (!invoiceId) invoiceId = getFirstPartyCaveatFromMacaroon(rootMacaroon)

  // if no discharge macaroon then we need to check on the status of the invoice
  // this can also be done in a separate request to GET /invoice
  if (!dischargeMacaroon) {
    // then check status of invoice (Note: Anyone can pay this! It's not tied to the request or origin.
    // Once paid, the requests are authorized and can get the macaroon)
    const { status, amount, payreq } = await checkInvoiceStatus(
      req.lnd,
      req.opennode,
      invoiceId
    )

    if (status === 'paid') {
      // amount is in satoshis which is equal to the amount of seconds paid for
      const milli = amount * 1000
      // add 200 milliseconds of "free time" as a buffer
      const time = new Date(Date.now() + milli + 200)
      const caveat = `time < ${time}`

      dischargeMacaroon = getDischargeMacaroon(invoiceId, location, caveat)

      console.log(`Invoice has been paid and is valid until ${time}`)

      // if invoice has been paid
      // then create a discharge macaroon and attach it to a session cookie
      if (req.session) req.session.dischargeMacaroon = dischargeMacaroon
    } else if (status === 'processing' || status === 'unpaid') {
      console.log('still processing invoice %s...', invoiceId)
      return res.status(202).json({ status, payreq })
    } else {
      return res
        .status(400)
        .json({ message: `unknown invoice status ${status}` })
    }
  }

  // With the discharge macaroon, we want to verify the whole macaroon
  try {
    // make sure request is authenticated by validating the macaroons
    const exactCaveat = getFirstPartyCaveat(invoiceId)
    validateMacaroons(rootMacaroon, dischargeMacaroon, exactCaveat)
    // if everything validates then simply run `next()`
    console.log(
      `Request from ${req.hostname} authenticated with payment. Sending through paywall`
    )
    next()
  } catch (e) {
    // if throws with an error message that includes text "expired"
    // then payment is required again
    if (e.message.toLowerCase().includes('expired')) {
      console.error('Request for content with expired macaroon')
      // clear cookies so that new invoices can be requested
      if (req.session) {
        req.session.macaroon = null
        req.session.dischargeMacaroon = null
      }
      return res.status(402).json({ message: e.message })
    }
    console.error('there was an error validating the macaroon:', e.message)
    return res
      .status(500)
      .json({ message: 'Server error. Please contact paywall administrator.' })
  }
}
