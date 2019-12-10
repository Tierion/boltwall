import { Response, NextFunction } from 'express'
import assert from 'assert'

import { LndRequest } from '../typings'
import { Lsat, verifyFirstPartyMacaroon, satisfiers } from '../lsat'
import { getEnvVars } from '../helpers'

/**
 * @description middleware to test existence and validity of macaroon
 */
export default async function validateLsat(
  req: LndRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
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

  // next make sure the lsat is properly encoded
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
    return next({ message: `Bad Request: malformed LSAT header`, details: e })
  }

  if (lsat.isExpired()) {
    req.logger.debug(
      `Request made with expired macaroon for ${req.originalUrl} from ${req.hostname}`
    )
    res.status(401)
    return next({
      message: 'Unauthorized: LSAT expired',
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
