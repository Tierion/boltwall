import assert from 'assert'
const { Macaroon } = require('macaroons.js')
import { CaveatPacketClass, MacaroonClass } from '../typings/lsat'
import { CaveatOptions, Satisfier } from '../typings'

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

export class Caveat {
  condition: string
  value: string | number
  comp: string
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

  encode(): string {
    return `${this.condition}${this.comp}${this.value}`
  }

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

export function verifyCaveats(
  caveats: Caveat[],
  ...satisfiers: Satisfier[]
): boolean {
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
      if (!satisfier.satisfyPrevious(prevCaveat, curCaveat)) return false
    }

    // check satisfyFinal for the final caveat
    if (!satisfier.satisfyFinal(caveatsList[caveatsList.length - 1]))
      return false
  }
  return true
}
