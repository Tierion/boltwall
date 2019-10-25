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
import { LndRequest, AsyncCaveatVerifier, CaveatVerifier } from '../typings'

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
    const invoice = await checkInvoiceStatus(req.lnd, req.opennode, invoiceId)
    const { status } = invoice

    if (status === 'paid' || status === 'held') {
      let caveat: string | undefined
      if (req.boltwallConfig && req.boltwallConfig.getCaveat)
        caveat = await req.boltwallConfig.getCaveat(req, invoice)

      dischargeMacaroon = getDischargeMacaroon(invoiceId, location, caveat)

      console.log(`Invoice ${invoiceId} has been paid`)

      // if invoice has been paid
      // then create a discharge macaroon and attach it to a session cookie
      if (req.session) req.session.dischargeMacaroon = dischargeMacaroon
    } else if (status === 'processing') {
      console.log('still processing invoice %s...', invoiceId)
      return res.status(202).json(invoice)
    } else if (status === 'unpaid') {
      console.log('still waiting for payment %s...', invoiceId)
      return res.status(402).json(invoice)
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

    // get a verifier if one is attached to the configs
    let verifier:
      | AsyncCaveatVerifier
      | undefined
      | CaveatVerifier = req.boltwallConfig
      ? req.boltwallConfig.caveatVerifier
      : undefined

    if (verifier) verifier = await verifier(req)

    validateMacaroons(rootMacaroon, dischargeMacaroon, exactCaveat, verifier)

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
    console.error('There was an error validating the macaroon:', e.message)
    return res.status(400).json({
      message:
        'Unable to authorize access. Proof of paid invoice required with proper credentials.',
    })
  }
}
