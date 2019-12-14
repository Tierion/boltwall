import { Macaroon, CaveatPacket } from 'macaroons.js'
import { Caveat } from '../lsat/caveat'
import { Request } from 'express'

/**
 * Describes the shape of the options for creating a new identifier struct
 * which represents the constant, unique identifiers associated with a macaroon
 */
export interface IdentifierOptions {
  version?: number
  paymentHash: Buffer
  tokenId?: Buffer
}

/**
 * Describes options to create a caveat. The condition is like the variable
 * and the value is what it is expected to be. Encoded format would be "condition=value"
 */
export interface CaveatOptions {
  condition: string
  value: string | number
  comp?: string
}

/**
 * Describes options to create an LSAT token.
 */
export interface LsatOptions {
  id: string
  baseMacaroon: string
  paymentHash: string
  invoice?: string
  timeCreated?: number
  paymentPreimage?: string
  amountPaid?: number
  routingFeePaid?: number
}

/**
 * Satisfier provides a generic interface to satisfy a caveat based on its
 * condition.
 */

export interface Satisfier {
  condition: string
  satisfyPrevious?: (prev: Caveat, curr: Caveat, request?: Request) => boolean
  satisfyFinal: (caveat: Caveat, request?: Request) => boolean
}

declare class MacaroonClass extends Macaroon {}
declare class CaveatPacketClass extends CaveatPacket {}
