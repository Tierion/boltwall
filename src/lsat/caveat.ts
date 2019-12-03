import assert from 'assert'

import { CaveatOptions } from '../typings'

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
  constructor(options: CaveatOptions) {
    this.condition = null
    this.value = null
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

    assert(
      typeof options.value === 'string' && options.value.length,
      'Require a value'
    )
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

  static decode(c: string): this {
    let compIndex
    for (let i = 0; i < c.length; i++) {
      if (validComp.has(c[i])) {
        compIndex = i
        break
      }
    }
    if (!compIndex) throw new ErrInvalidCaveat()

    const condition = c.slice(0, compIndex)
    const comp = c[compIndex]
    const value = c.slice(compIndex + 1)

    return new this({ condition, comp, value })
  }
}
