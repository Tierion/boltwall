import { Request, Response, NextFunction } from 'express'
import assert from 'assert'
import * as Macaroon from 'macaroon'

import { Lsat, verifyFirstPartyMacaroon, Satisfier } from 'lsat-js'
import { getEnvVars, isHex } from '../helpers'
import * as configs from '../configs'
import { challengeSatisfier } from '../satisfiers'
import { BoltwallConfig } from '../typings'

/**
 * @description Middleware to test existence and validity of LSAT or LSAT request.
 * This middleware includes checks for hodl invoice configuration, which if active
 * requires a payment hash if there's not already an LSAT header
 * @param {Request} req - Request object that includes a user defined configuration object
 * @param {Response} res
 * @param {NextFunction} next
 */
export default async function validateLsat(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { headers } = req

  // if hodl is enabled and there is not already an auth header
  // then we need to check if there is a paymentHash in the request body
  if (
    req.boltwallConfig &&
    req.boltwallConfig.hodl &&
    !req.body?.paymentHash &&
    (!headers.authorization || !headers.authorization.includes('LSAT'))
  ) {
    req.logger.debug(
      `Request made to hodl-protected endpoint ${req.originalUrl} without LSAT or payment hash.`
    )
    res.status(400)
    return next({
      message:
        'Request malformed: Missing paymentHash in request body. Required to create HODL invoice LSAT',
    })
  } else if (
    req.body &&
    req.body.paymentHash &&
    // if there is a paymentHash then we need to validate it
    (req.body.paymentHash.length !== 64 || !isHex(req.body.paymentHash))
  ) {
    res.status(400)
    return next({
      message:
        'Request malformed: Expected a 256-bit string for the payment hash',
    })
  }

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
  const macaroon = Macaroon.importMacaroons(lsat.getMacaroon())[0]

  type DefaultConfigs = {
    [key:string]: BoltwallConfig
  }

  const defaultConfigs: DefaultConfigs = Object.assign(configs, {})
  let satisfiers: Satisfier[] = []
  
  for (const key in defaultConfigs) {
    const config = defaultConfigs[key]
    if (config.caveatSatisfiers) {
      const caveatSatisfiers = Array.isArray(config.caveatSatisfiers) ? config.caveatSatisfiers : [config.caveatSatisfiers]
      satisfiers.push(...caveatSatisfiers)
    }
  }
  
  if (req.boltwallConfig && req.boltwallConfig.oauth) {
    satisfiers.push(challengeSatisfier)
  }
  
  if (req.boltwallConfig?.caveatSatisfiers) {
    const caveatSatisfiers = Array.isArray(req.boltwallConfig?.caveatSatisfiers) ? req.boltwallConfig?.caveatSatisfiers : [req.boltwallConfig?.caveatSatisfiers]
    satisfiers = [...satisfiers, ...caveatSatisfiers]
  }

  const isValid = verifyFirstPartyMacaroon(
    Macaroon.bytesToBase64(macaroon._exportBinaryV2()),
    SESSION_SECRET,
    satisfiers,
    req
  )

  if (!isValid) {
    req.logger.debug('Request made with invalid LSAT macaroon')
    res.status(401)
    return next({
      message: 'Unauthorized: LSAT invalid',
    })
  }

  next()
}
