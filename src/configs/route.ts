/**
 * @file provides custom configurations for a paywall that restricts
 * access based on route that request was first made for
 */

import { Request } from 'express'
import { BoltwallConfig, DescriptionGetter, CaveatGetter } from '../typings'

import { Caveat } from 'lsat-js'
import { routeSatisfier } from '../satisfiers'

/**
 * @type {DescriptionGetter}
 * @description Generates an invoice description indiciating that this is for payment
 * of an invoice for restricting access based on a single route.
 * @example
 * // Always returns `Request made for authorization restricted to a single route`
 * @returns {string}
 */
const getRouteInvoiceDescription: DescriptionGetter = (req: Request): string =>
  `Request made for authorization restricted to ${req.path} route`

/**
 * @type {CaveatGetter}
 * @description Creates a general caveat where the macaroon this is attached to
 * will only be valid for requests made to the route where original request
 * for access was made to
 * @returns {string} encoded caveat
 */
const getRouteCaveat: CaveatGetter = (req: Request) => {
  const path = req.path
  const caveat = new Caveat({ condition: 'route', value: path })
  return caveat.encode()
}

const ROUTE_CAVEAT_CONFIGS: BoltwallConfig = {
  minAmount: 1,
  getInvoiceDescription: getRouteInvoiceDescription,
  getCaveats: getRouteCaveat,
  caveatSatisfiers: routeSatisfier,
}

export default ROUTE_CAVEAT_CONFIGS
