import assert from 'assert'

import { Caveat } from './caveat'
/**
 * Satisfier provides a generic interface to satisfy a caveat based on its
 * condition.
 */

export class Satisfier {
  constructor(condition: string) {
    assert(
      typeof condition === 'string' && condition.length,
      'Satisfier requires a condition'
    )

    this.condition = condition
  }

  satisfyPrevious(prev: Caveat, curr: Caveat): boolean {
    return true
  }

  satisfyFinal(caveat: Caveat): boolean {
    return true
  }
}
