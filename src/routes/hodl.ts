import { Response, Router, NextFunction } from 'express'
const lnService = require('ln-service')

import { LndRequest, InvoiceBody, InvoiceResponse } from '../typings'
import { getLocation, createRootMacaroon } from '../helpers'

const router: Router = Router()

/**
 * ## Route: POST /hodl
 * Generate a new hodl invoice based on a given request which must include
 * a payment hash to lock to.
 * IMPORTANT: lnd node being interacted with MUST have `invoicesrpc` tag set
 * when building otherwise hodl invoices won't be supported and this will return an error
 * @param {string} req.body.paymentHash - required, 256-bit hash to lock invoice to.
 * The corresponding preimage will be required to settle this invoice.
 * @param {string|number} [req.body.amount]
 * @param {string} [req.body.description] - custom invoice description
 * @param {string|number} [req.body.cltvDelta] - useful for policing good behavior.
 * If coordinating with other parties, this SHOULD be greater than any other dependent invoices.
 * Otherwise, counterparty could wait out the hodl invoice and cost the node its funds
 */
async function postNewHodl(
  req: LndRequest,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  console.log('Request to create new hodl invoice')
  const location: string = getLocation(req)
  const body: InvoiceBody = req.body

  const { paymentHash, amount, description, cltvDelta } = body

  // throw error if no payment hash was found on the body,
  // which is necessary to create the hodl invoice
  if (!paymentHash) {
    res.status(400)
    return next({
      message:
        'Expected a paymentHash to be included in request body. None was found.',
    })
  }

  if (paymentHash.length !== 64) {
    res.status(400)
    return next({ message: 'Expected a 256 bit string for the payment hash' })
  }

  const paymentInfo = {
    lnd: req.lnd,
    id: paymentHash,
    tokens: amount,
    description:
      description || `HODL invoice created on request made by ${location}`,
    cltv_delta: cltvDelta,
  }

  try {
    const {
      created_at,
      description,
      id,
      request,
      tokens,
    } = await lnService.createHodlInvoice(paymentInfo)
    const invoice: InvoiceResponse = {
      id,
      payreq: request,
      description,
      createdAt: created_at,
      amount: tokens,
    }

    // create a root macaroon with the associated id
    // NOTE: Root macaroon does not authenticate access
    // it only indicates that the payment process has been initiated
    // and associates the given invoice with the current session

    // check if we need to also add a third party caveat to macaroon
    let has3rdPartyCaveat =
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
  } catch (e) {
    console.log('There was a problem creating hodl invoice:', e)
    // lnService returns errors as array
    if (Array.isArray(e)) {
      res.status(e[0])
      return next({ message: e[1], details: e[2].err.details })
    }

    res.status(500)
    return next({ message: 'Problem processing new hodl invoice' })
  }
}

/**
 * ## ROUTE: PUT /hodl
 * Endpoint for settling a hodl invoice. Invoice status can
 * be retrieved with the normal GET or PUT /invoice endpoint
 * @param {string} req.body.secret - payment hash preimage to settle invoice
 * @returns {Promise<boolean>} res.json.success - true if settled successfully
 */
async function settleHodl(
  req: LndRequest,
  res: Response,
  next: NextFunction
): Promise<any> {
  const { secret } = req.body

  if (!secret) {
    res.status(400)
    return res.json({
      message: 'require secret/preimage in order to settle hodl invoice',
    })
  }

  if (secret.length !== 64) {
    res.status(400)
    return next({
      message:
        'preimage is of incorrect length. Must be a 246 bit (64 chars) hex string.',
    })
  }

  try {
    await lnService.settleHodlInvoice({ lnd: req.lnd, secret })

    res.status(200)
    return next()
  } catch (e) {
    console.error('There was an error settling a hodl invoice:', e)
    // lnService returns errors as array
    if (Array.isArray(e) && e[2]) {
      res.status(e[0])
      return next({ message: e[1], details: e[2].err.details })
    }

    res.status(500)
    return next({
      message:
        'The server encountered an error processing the hodl invoice. Please try again later or contact server admin.',
    })
  }
}

router
  .route('*/hodl')
  .post(postNewHodl)
  .put(settleHodl)

export default router
