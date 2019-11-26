import { Response, Router, NextFunction } from 'express'

import { LndRequest, InvoiceResponse } from '../typings'
import {
  createInvoice,
  checkInvoiceStatus,
  getDischargeMacaroon,
  getLocation,
  getFirstPartyCaveatFromMacaroon,
  createRootMacaroon,
} from '../helpers'

const router: Router = Router()

/**
 * ## Route: PUT /invoice
 * Checks the status of an invoice based on a specific id in the query parameter.
 * If the invoice is paid then a discharge macaroon will be attached to the session.
 * The discharge macaroon can have a custom caveat set on it based on configs passed into
 * Boltwall on initialization of the middleware.
 * (Formerly GET /invoice which is still supported but PUT is preferred when a body is sent)
 */
async function updateInvoiceStatus(
  req: LndRequest,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  let invoiceId = req.query.id

  // if the query doesn't have an id, but we have a root macaroon, we can
  // get the id from that
  if (!invoiceId && req.session && req.session.macaroon) {
    invoiceId = getFirstPartyCaveatFromMacaroon(req.session.macaroon)
  } else if (!invoiceId) {
    res.status(404)
    return next({ message: 'Missing invoiceId in request' })
  }

  try {
    console.log('Checking status of invoice:', invoiceId)
    const { lnd, opennode } = req
    const invoice = await checkInvoiceStatus(lnd, opennode, invoiceId)
    const { status } = invoice
    // a held invoice is technically properly paid
    // so we can treat it as such to at least pass it through the paywall
    // it is up to the middleware implementer to decide what to do with a
    // held invoice, discharge macaroon passed however allowing requests through paywall
    if (status === 'paid' || status === 'held') {
      const location = getLocation(req)

      let caveat: string | undefined
      if (req.boltwallConfig && req.boltwallConfig.getCaveat)
        caveat = await req.boltwallConfig.getCaveat(req, invoice)

      const macaroon = getDischargeMacaroon(invoiceId, location, caveat)

      // save discharge macaroon in a cookie. Request should have two macaroons now
      if (req.session) req.session.dischargeMacaroon = macaroon // tslint-disable-line

      console.log(`Invoice ${invoiceId} has been paid`)

      res.status(200)
      return res.json({ status, discharge: macaroon })
    } else if (status === 'processing' || status === 'unpaid') {
      console.log('Still processing invoice %s...', invoiceId)
      res.status(202)
      return res.json(invoice)
    } else {
      res.status(400)
      return next({ message: `Unknown invoice status ${status}` })
    }
  } catch (error) {
    console.error('Error getting invoice:', error)
    res.status(400)
    return next({ message: error })
  }
  return next()
}

/**
 * ## Route: POST /invoice
 * Generate a new invoice based on a given request.
 * This will also create a new root macaroon to associate with the session.
 * The root macaroon and associated 3rd party caveat must be satisfied
 * before access to the protected route will be granted
 */
async function postNewInvoice(
  req: LndRequest,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  console.log('Request to create a new invoice')
  try {
    const location: string = getLocation(req)

    // create an invoice
    const invoice: InvoiceResponse = await createInvoice(req)

    // create a root macaroon with the associated id
    // NOTE: Root macaroon does not authenticate access
    // it only indicates that the payment process has been initiated
    // and associates the given invoice with the current session

    // check if we need to also add a third party caveat to macaroon
    const has3rdPartyCaveat =
      req.boltwallConfig && req.boltwallConfig.getCaveat ? true : false

    const macaroon = await createRootMacaroon(
      invoice.id,
      location,
      has3rdPartyCaveat
    )

    // and send back macaroon and invoice info back in response
    if (req.session) req.session.macaroon = macaroon
    res.status(200)
    return res.json(invoice)
  } catch (error) {
    console.error('Error getting invoice:', error)
    res.status(400)
    return next({ message: error.message })
  }
}

router
  .route('*/invoice')
  .post(postNewInvoice)
  .put(updateInvoiceStatus)
  .get(updateInvoiceStatus)

export default router
