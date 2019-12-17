import { Satisfier } from '../typings'
import { getOriginFromRequest } from '../helpers'

/**
 * @description A satisfier for validating expiration caveats on macaroon. Used in the exported
 * boltwallConfig TIME_CAVEAT_CONFIGS
 * @type Satisfier
 */
export const expirationSatisfier: Satisfier = {
  condition: 'expiration',
  satisfyPrevious: (prev, curr) => {
    if (prev.condition !== 'expiration' || curr.condition !== 'expiration')
      return false
    // fails if current expiration is later than previous
    // (i.e. newer caveats should be more restrictive)
    else if (prev.value < curr.value) return false
    else return true
  },
  satisfyFinal: caveat => {
    if (caveat.condition !== 'expiration') return false
    // if the expiration value is less than current time than satisfier is failed
    if (caveat.value < Date.now()) return false
    return true
  },
}

/**
 * @description A satisfier for validating caveats based on the origin IP
 * used in the exported boltwallConfig ORIGIN_CAVEAT_CONFIGS
 * Does not allow for caveats with different ips otherwise anyone could add their own
 * @type Satisfier
 */
export const originSatisfier: Satisfier = {
  condition: 'ip',
  satisfyPrevious: (prev, curr) => {
    if (prev.condition !== 'ip' || curr.condition !== 'ip') return false
    else if (prev.value !== curr.value) return false
    else return true
  },
  satisfyFinal: (caveat, req) => {
    const origin = getOriginFromRequest(req)
    if (caveat.condition === 'ip' && caveat.value === origin) return true
    else return false
  },
}
