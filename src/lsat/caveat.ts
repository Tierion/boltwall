/**
 * @file Provides utilities for managing, analyzing, and validating caveats
 * @author Buck Perley
 */

import assert from 'assert'
import { Request } from 'express'
const { Macaroon, MacaroonsVerifier } = require('macaroons.js')
import { CaveatPacketClass, MacaroonClass } from '../typings/lsat'
import { CaveatOptions } from '../typings'

/**
 * @description Creates a new error describing a problem with creating a new caveat
 * @extends Error
 */
export class ErrInvalidCaveat extends Error {
  constructor(...params: any[]) {
    // Pass remaining arguments (including vendor specific ones) to parent constructor
    super(...params)

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ErrInvalidCaveat)
    }

    this.name = 'ErrInvalidCaveat'
    // Custom debugging information
    this.message = `Caveat must be of the form "condition[<,=,>]value"`
  }
}

const validComp = new Set(['<', '>', '='])

/**
 * @description A caveat is a class with a condition, value and a comparator. They 
 * are used in macaroons to evaluate the validity of a macaroon. The Caveat class
 * provides a method for turning a string into a caveat object (decode) and a way to
 * turn a caveat into a string that can be encoded into a macaroon.
 */
export class Caveat {
  condition: string
  value: string | number
  comp: string

  /**
   * Create a caveat
   * @param {Object} options - options to create a caveat from
   * @param {string} options.condition - condition that will be evaluated, e.g. "expiration", "ip", etc.
   * @param {string} options.value - the value that the caveat should equal. When added to a macaroon this is what 
   * the request is evaluated against. 
   * @param {string} [comp="="] - one of "=", "<", ">" which describes how the value is compared. So "time<1576799124987"
   * would mean we will evaluate a time that is less than "1576799124987"
   */
  constructor(options: CaveatOptions) {
    this.condition = ''
    this.value = ''
    this.comp = '='

    if (options) this.fromOptions(options)
  }

  fromOptions(options: CaveatOptions): this {
    assert(options, 'Data required to create new caveat')

    assert(
      typeof options.condition === 'string' && options.condition.length,
      'Require a condition'
    )
    this.condition = options.condition

    assert(options.value, 'Requires a value to create a caveat')
    options.value.toString()
    this.value = options.value

    if (options.comp) {
      if (!validComp.has(options.comp)) throw new ErrInvalidCaveat()
      this.comp = options.comp
    }

    return this
  }

  /**
   * @returns {string} Caveat as string value. e.g. `expiration=1576799124987`
   */
  encode(): string {
    return `${this.condition}${this.comp}${this.value}`
  }

  /**
   * 
   * @param {string} c - create a new caveat from a string
   * @returns {Caveat}
   */
  static decode(c: string): Caveat {
    let compIndex
    for (let i = 0; i < c.length; i++) {
      if (validComp.has(c[i])) {
        compIndex = i
        break
      }
    }
    if (!compIndex) throw new ErrInvalidCaveat()

    const condition = c.slice(0, compIndex).trim()
    const comp = c[compIndex].trim()
    const value = c.slice(compIndex + 1).trim()

    return new this({ condition, comp, value })
  }
}

/**
 * @description hasCaveat will take a macaroon and a caveat and evaluate whether or not
 * that caveat exists on the macaroon
 * @param {MacaroonClass} macaroon 
 * @param {Caveat|string} c
 * @returns {boolean} 
 */
export function hasCaveat(
  macaroon: MacaroonClass,
  c: Caveat | string
): string | boolean | ErrInvalidCaveat {
  assert(
    macaroon instanceof Macaroon,
    'Expected a macaroon object as first argument'
  )

  let caveat: Caveat
  if (typeof c === 'string') caveat = Caveat.decode(c)
  else caveat = c

  const condition = caveat.condition

  let value
  macaroon.caveatPackets.forEach((packet: CaveatPacketClass) => {
    try {
      const test = Caveat.decode(packet.getValueAsText())
      if (condition === test.condition) value = test.value
    } catch (e) {
      // ignore if caveat is unable to be decoded since we don't know it anyway
    }
  })
  if (value) return value
  return false
}

/**
 * @description A function that verifies the caveats on a macaroon. 
 * The functionality mimics that of loop's lsat utilities.
 * @param caveats a list of caveats to verify
 * @param {Request} request a request object with a boltwallConfig that includes 
 * satisfiers property
 * @returns {boolean}
 */
export function verifyCaveats(
  caveats: Caveat[],
  req: Request
): boolean {
  assert(
    req.boltwallConfig && req.boltwallConfig?.caveatSatisfiers,
    'Must have a boltwall config with satisfiers on the request object in order to verify caveats'
  )

  let satisfiers = req.boltwallConfig?.caveatSatisfiers

  // if there are no satisfiers then we can just assume everything is verified
  if (!satisfiers) return true
  else if (!Array.isArray(satisfiers)) satisfiers = [satisfiers]
  
  // create map of satisfiers keyed by their conditions
  const caveatSatisfiers = new Map()

  for (const satisfier of satisfiers) {
    caveatSatisfiers.set(satisfier.condition, satisfier)
  }

  // create a map of relevant caveats to satisfiers keyed by condition
  // with an array of caveats for each condition
  const relevantCaveats = new Map()

  for (const caveat of caveats) {
    // skip if condition is not in our satisfier map
    const condition = caveat.condition
    if (!caveatSatisfiers.has(condition)) continue

    if (!relevantCaveats.has(condition)) relevantCaveats.set(condition, [])
    const caveatArray = relevantCaveats.get(condition)
    caveatArray.push(caveat)
    relevantCaveats.set(condition, caveatArray)
  }

  // for each condition in the caveat map
  for (const [condition, caveatsList] of relevantCaveats) {
    // get the satisifer for that condition
    const satisfier = caveatSatisfiers.get(condition)

    // loop through the array of caveats
    for (let i = 0; i < caveatsList.length - 1; i++) {
      // confirm satisfyPrevious
      const prevCaveat = caveatsList[i]
      const curCaveat = caveatsList[i + 1]
      if (!satisfier.satisfyPrevious(prevCaveat, curCaveat, req)) return false
    }

    // check satisfyFinal for the final caveat
    if (!satisfier.satisfyFinal(caveatsList[caveatsList.length - 1], req))
      return false
  }
  return true
}

/**
 * @description verifyFirstPartyMacaroon will check if a macaroon is valid or
 * not based on a set of satisfiers to pass as general caveat verifiers. This will also run
 * against caveat.verityCaveats to ensure that satisfyPrevious will validate
 * @param {Macaroon} macaroon A macaroon class to run a verifier against
 * @param {String} secret The secret key used to sign the macaroon
 * @param {Request} req The request object which contains any custom satisfiers from the boltwall config as well
 * as relevant request information to provide to the satisfiers
 * @returns {boolean}
 */
export function verifyFirstPartyMacaroon(
  macaroon: MacaroonClass,
  secret: string,
  req: Request
): boolean {
  const verifier = new MacaroonsVerifier(macaroon)
  
  if (req.boltwallConfig && req.boltwallConfig.caveatSatisfiers) {
    let satisfiers = req.boltwallConfig.caveatSatisfiers
    
    if (!Array.isArray(satisfiers)) satisfiers = [satisfiers]
    
    for (const satisfier of satisfiers) {
      // first convert the caveat string that satisfy general gives us
      // into a caveat object and pass that to our satisfier functions
      verifier.satisfyGeneral((rawCaveat: string) => {
        const caveat = Caveat.decode(rawCaveat)
        const valid = satisfier.satisfyFinal(caveat, req)
        return valid
      })
    }
    
    // want to also do previous caveat check
    const caveats = []
    for (const { rawValue } of macaroon.caveatPackets) {
      const caveat = Caveat.decode(rawValue.toString())
      caveats.push(caveat)
    }
    
    if (!verifyCaveats(caveats, req)) {
      req.logger.debug('Caveat verification for macaroon failed')
      return false
    }
  }

  return verifier.isValid(secret)
}
