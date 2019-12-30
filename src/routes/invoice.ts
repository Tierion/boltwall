import {
  Response,
  Request,
  Router,
  NextFunction,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Handler,
} from 'express'

import { InvoiceResponse } from '../typings'
import { Lsat } from 'lsat-js'
import { createInvoice, checkInvoiceStatus } from '../helpers'
import { validateLsat } from '.'
const router: Router = Router()

/**
 * ## Route: GET /invoice
 * @description Get information about an invoice including status and secret. Request must be
 * authenticated with a macaroon. The handler will check for an LSAT and reject requests
 * without one since this is where the invoice id is extracted from.
 * @type {Handler}
 */
async function getInvoice(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  const { headers } = req

  if (!headers.authorization || !headers.authorization.includes('LSAT')) {
    req.logger.info(
      `Unauthorized request made without macaroon for ${req.originalUrl} from ${req.hostname}`
    )
    res.status(400)
    return next({
      message: 'Bad Request: Missing LSAT authorization header',
    })
  }

  // get the lsat from the auth header
  const lsat = Lsat.fromToken(headers.authorization)

  if (lsat.isExpired()) {
    req.logger.debug(
      `Request made with expired macaroon for ${req.originalUrl} from ${req.hostname}`
    )
    res.status(401)
    return next({
      message: 'Unauthorized: LSAT expired',
    })
  }

  // validation happens in validateLsat middleware
  // all this route has to do is confirm that the invoice exists
  let invoice
  try {
    invoice = await checkInvoiceStatus(
      lsat.paymentHash,
      req.lnd,
      req.opennode,
      true
    )
  } catch (e) {
    // handle ln-service errors
    if (Array.isArray(e)) {
      req.logger.error(`Problem looking up invoice:`, ...e)
      if (e[0] === 503) {
        res.status(404)
        return res.send({
          error: { message: 'Unable to find invoice with that id' },
        })
      } else {
        res.status(500)
        return res.send({
          error: { message: 'Unknown error when looking up invoice' },
        })
      }
    }
  }

  res.status(200)
  return res.send(invoice)
}

/**
 * ## Route: POST /invoice
 * @description Generate a new invoice based on a given request. No LSAT services
 * provided, so this endpoint should be used sparingly since a payment made will
 * not authenticate a request automatically (since there's no associated lsat or macaroon)
 * @type {Handler}
 */
async function postNewInvoice(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  req.logger.info('Request to create a new invoice')
  try {
    // create an invoice
    const invoice: InvoiceResponse = await createInvoice(req)
    res.status(200)
    return res.json(invoice)
  } catch (e) {
    if (Array.isArray(e)) {
      req.logger.error(`Problem creating invoice:`, ...e)
      if (e[0] === 400) {
        res.status(404)
        return next({ message: e[1] })
      } else {
        res.status(500)
        return res.send({
          error: { message: 'Unknown error when looking up invoice' },
        })
      }
    }
    req.logger.error('Error getting invoice:', e)
    res.status(400)
    return next({ message: e.message })
  }
}

router
  .route('*/invoice')
  .post(postNewInvoice)
  .all(validateLsat)
  .get(getInvoice)

export default router
