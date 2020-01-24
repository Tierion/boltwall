/**
 * @file provides custom configurations for a paywall that restricts
 * access based on origin that request was first made from
 */

import { Request } from 'express'
import { BoltwallConfig, DescriptionGetter, CaveatGetter } from '../typings'

import { Caveat } from 'lsat-js'
import { originSatisfier } from './satisfiers'
import { getOriginFromRequest } from '../helpers'

/**
 * @type {DescriptionGetter}
 * @description Generates an invoice description indiciating that this is for payment
 * of an invoice for restricting access based on origin. Does not include
 * actual IP for privacy reasons.
 * @example
 * // Always returns `Request made for authorization restricted to single origin`
 * @returns {string}
 */
const getOriginInvoiceDescription: DescriptionGetter = () =>
  `Request made for authorization restricted to single origin`

/**
 * @type {CaveatGetter}
 * @description Creates a general caveat where the macaroon this is attached to
 * will only be valid for requests made from the ip address where original request
 * for access was made from
 * @returns {string} encoded caveat
 */
const getOriginCaveat: CaveatGetter = (req: Request) => {
  const origin = getOriginFromRequest(req)
  const caveat = new Caveat({ condition: 'ip', value: origin })
  return caveat.encode()
}

const ORIGIN_CAVEAT_CONFIGS: BoltwallConfig = {
  minAmount: 1,
  getInvoiceDescription: getOriginInvoiceDescription,
  getCaveats: getOriginCaveat,
  caveatSatisfiers: originSatisfier,
}

export default ORIGIN_CAVEAT_CONFIGS
