import { Request, Response, NextFunction } from 'express'
import assert from 'assert'

import { Lsat, verifyFirstPartyMacaroon, satisfiers } from '../lsat'
import { getEnvVars } from '../helpers'

/**
 * @description middleware to test existence and validity of macaroon
 */
export default async function validateLsat(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { headers } = req
  // if no LSAT then it depends on the route for how to handle it
  if (!headers.authorization || !headers.authorization.includes('LSAT')) {
    return next()
  }

  // if we have an lsat header
  // need  make sure the lsat is properly encoded
  let lsat: Lsat
  try {
    lsat = Lsat.fromToken(headers.authorization)
    assert(lsat, 'Could not decode lsat from authorization header')
  } catch (e) {
    req.logger.debug(
      `Received malformed LSAT authorization header from ${req.hostname}: ${headers.authorization}`
    )
    req.logger.error(e)
    res.status(400)
    return next({ message: `Bad Request: Malformed LSAT header.`, details: e })
  }

  if (lsat.isExpired()) {
    req.logger.debug(
      `Request made with expired LSAT for ${req.originalUrl} from ${req.hostname}`
    )
    res.status(401)
    return next({
      message: 'Unauthorized: Request made with expired LSAT',
    })
  }

  // verify macaroon
  const { SESSION_SECRET } = getEnvVars()
  const isValid = verifyFirstPartyMacaroon(
    lsat.getMacaroon(),
    SESSION_SECRET,
    satisfiers.expirationSatisfier
  )
  if (!isValid) {
    res.status(401)
    return next({
      message: 'Unauthorized: LSAT invalid',
    })
  }

  next()
}
