import { Response, Request, Router, NextFunction } from 'express'

import { InvoiceResponse } from '../typings'
import { Lsat } from '../lsat'
import { createInvoice, checkInvoiceStatus } from '../helpers'
import { validateLsat } from '.'
const router: Router = Router()

/**
 * ## Route: GET /invoice
 * Get information about an invoice including status and secret. Request must be
 * authenticated with a macaroon
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
      req.lnd,
      req.opennode,
      lsat.paymentHash,
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
 * Generate a new invoice based on a given request.
 * This will also create a new root macaroon to associate with the session.
 * The root macaroon and associated 3rd party caveat must be satisfied
 * before access to the protected route will be granted
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
    req.logger.error('Error getting invoice:', error)
    res.status(400)
    return next({ message: error.message })
  }
}

router
  .route('*/invoice')
  .post(postNewInvoice)
  .all(validateLsat)
  .get(getInvoice)

export default router
