import { Satisfier, Caveat } from 'lsat-js'
import { Request } from 'express'
import { getOriginFromRequest } from '../helpers'

/**
 * @description A satisfier for validating caveats based on the origin IP
 * used in the exported boltwallConfig ORIGIN_CAVEAT_CONFIGS
 * Does not allow for caveats with different ips otherwise anyone could add their own
 * @type Satisfier
 */
const originSatisfier: Satisfier = {
  condition: 'ip',
  satisfyPrevious: (prev: Caveat, curr: Caveat) => {
    if (prev.condition !== 'ip' || curr.condition !== 'ip') return false
    else if (prev.value !== curr.value) return false
    else return true
  },
  satisfyFinal: (caveat: Caveat, req: Request) => {
    const origin = getOriginFromRequest(req)
    if (caveat.condition === 'ip' && caveat.value === origin) return true
    else return false
  },
}

export default originSatisfier
