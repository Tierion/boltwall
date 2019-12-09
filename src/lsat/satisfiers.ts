import { Satisfier } from '../typings'

export const expirationSatisfier: Satisfier = {
  condition: 'expiration',
  satisfyPrevious: (prev, curr) => {
    if (prev.condition !== 'expiration' || curr.condition !== 'expiration')
      return false
    else if (prev.value > curr.value) return false
    // confirm that the newer caveat is more restrictive
    else return true
  },
  satisfyFinal: caveat => {
    if (caveat.condition !== 'expiration') return false
    // if the expiration value is less than current time than satisfier is failed
    if (caveat.value < Date.now()) return false
    return true
  },
}
