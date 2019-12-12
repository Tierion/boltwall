import { Response, NextFunction, Request } from 'express'
import { InvoiceResponse } from '../typings'
import {
  createInvoice,
  checkInvoiceStatus,
  createLsatFromInvoice,
  getLocation,
} from '../helpers'
import { Lsat } from '../lsat'

export default async function paywall(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  const { headers } = req
  // If missing LSAT in request to protected content
  // then we need to create a new invoice and corresponding LSAT
  let lsat: Lsat | undefined = undefined
  if (headers.authorization) {
    try {
      lsat = Lsat.fromToken(headers.authorization)
    } catch (e) {
      req.logger.error(
        'Could not create LSAT from given authorization header: %s. Error: %s',
        headers.authorization,
        e.message
      )
    }
  }
  if (!headers.authorization || !lsat || lsat.isExpired()) {
    let invoice: InvoiceResponse
    try {
      invoice = await createInvoice(req)
    } catch (e) {
      // handle ln-service errors
      if (Array.isArray(e)) {
        req.logger.error('Problem generating invoice:', ...e)
      } else {
        req.logger.error('Problem generating invoice:', e.message)
      }
      res.status(500)
      return next({ message: 'Problem generating invoice' })
    }

    const location = getLocation(req)

    // TODO: Support custom caveats and expiration caveat
    const lsat = createLsatFromInvoice({ invoice, location })
    res.status(402)
    res.set({
      'WWW-Authenticate': lsat.toChallenge(),
    })
    req.logger.debug(
      `Request made for ${req.baseUrl} from ${req.hostname} that requires payment. LSAT ID: ${lsat.id}`
    )
    return next({ message: 'Payment required' })
  } else if (!lsat.paymentPreimage) {
    req.logger.debug(
      `Request made from ${req.headers.host} with LSAT but no secret`
    )
    const { payreq } = await checkInvoiceStatus(req.lnd, null, lsat.paymentHash)
    lsat.invoice = payreq
    res.status(402)
    res.set({ 'WWW-Authenticate': lsat.toChallenge() })
    return next()
  }
  req.logger.debug('Request made with valid LSAT token with id: %s', lsat.id)
  next()
}
