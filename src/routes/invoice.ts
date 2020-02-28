import { Response, Request, Router, NextFunction } from 'express'
import { Lsat } from 'lsat-js'

import { InvoiceResponse } from '../typings'
import { createInvoice, checkInvoiceStatus, isHex } from '../helpers'
import validateLsat from './validate'
const router: Router = Router()

/**
 * ## Route: GET /invoice
 * @description Get information about an invoice including status and secret. Request must be
 * authenticated with an LSAT if requesting secret. Supports requesting for invoice
 * based on hash in query parameter "id" OR from an attached LSAT.
 */
async function getInvoice(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  let { id } = req.query
  let lsat
  if (req.headers.authorization) {
    try {
      lsat = Lsat.fromToken(req.headers.authorization)
      if (lsat.paymentHash && !id) id = lsat.paymentHash
    } catch (e) {
      req.logger.warning(
        'Failed to create an LSAT from authorization header: %s',
        e.message || e
      )
    }
  }

  if (!id || id.length !== 64 || !isHex(id)) {
    res.status(400)
    return next({
      message:
        'Bad Request: Missing valid payment hash in required query parameter "id" for looking up invoice',
    })
  }

  let invoice
  try {
    // if we have an LSAT included then it will have been validated already
    // in an earlier middleware and we can include the secret (which will only
    // be shown if it has been paid as well)
    const includeSecret = lsat ? true : false
    invoice = await checkInvoiceStatus(id, req.lnd, req.opennode, includeSecret)
  } catch (e) {
    // handle ln-service errors
    if (Array.isArray(e)) {
      req.logger.error(`Problem looking up invoice:`, ...e)
      if (e[0] === 503) {
        res.status(404)
        return next({
          message: 'Unable to find invoice with that id',
        })
      } else {
        res.status(500)
        return next({
          message: 'Unknown error when looking up invoice',
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
