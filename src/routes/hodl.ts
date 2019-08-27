import { Response, Router, NextFunction } from 'express'
const lnService = require('ln-service')

import { LndRequest, InvoiceBody, InvoiceResponse } from '../typings'
import { getLocation } from '../helpers'

const router: Router = Router()

/**
 * ## Route: POST /hodl
 * Generate a new hodl invoice based on a given request which must include
 * a payment hash to lock to.
 * IMPORTANT: lnd node being interacted with MUST have `invoicesrpc` tag set
 * when building otherwise hodl invoices won't be supported and this will return an error
 */
async function postNewHodl(req: LndRequest, res: Response, next: NextFunction) {
  const location: string = getLocation(req)
  const body: InvoiceBody = req.body

  const { paymentHash, amount, description, cltvDelta } = body

  // throw error if no payment hash was found on the body,
  // which is necessary to create the hodl invoice
  if (!paymentHash)
    return res.status(400).json({
      message:
        'Expected a paymentHash to be included in request body. None was found.',
    })

  if (paymentHash.length !== 64)
    return res
      .status(400)
      .json({ message: 'Expected a 256 bit string for the payment hash.' })

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
    return res.status(200).json(invoice)
  } catch (e) {
    return next(e.message)
  }
}

/**
 * ## ROUTE: PUT /hodl
 * Endpoint for settling a hodl invoice. Invoice status can
 * be retrieved with the normal GET /invoice endpoint
 * @param {Express.request.body.secret} secret -
 */
async function settleHodl(req: LndRequest, res: Response) {
  const { secret } = req.body

  if (!secret)
    return res.status(400).json({
      message: 'require secret/preimage in order to settle hodl invoice',
    })

  try {
    const status = await lnService.settleHodlInvoice({ lnd: req.lnd, secret })
    console.log('status:', status)

    return res.status(200).json({ success: true })
  } catch (e) {
    console.error('There was an error settling a hodl invoice:', e)
    return res.status(500).json({
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
