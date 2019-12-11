import { Response, NextFunction, Request } from 'express'
import { MacaroonsBuilder } from 'macaroons.js'
import { InvoiceResponse } from '../typings'
import { createInvoice, getEnvVars, checkInvoiceStatus } from '../helpers'
import { Identifier, Lsat } from '../lsat'

export default async function boltwall(
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

    const { payreq, id } = invoice
    const identifier = new Identifier({
      paymentHash: Buffer.from(id, 'hex'),
    })
    const { SESSION_SECRET } = getEnvVars()
    const location = req.headers.host || req.headers.hostname

    // TODO: Support custom caveats and expiration caveat
    const macaroon = MacaroonsBuilder.create(
      location,
      SESSION_SECRET,
      identifier.toString()
    )
    const lsat = Lsat.fromMacaroon(macaroon.serialize(), payreq)
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
