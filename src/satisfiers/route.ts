import { Satisfier, Caveat } from 'lsat-js'
import { Request } from 'express'
const { MASTER_ROUTE } = process.env

/**
 * @description A satisfier for validating caveats based on the original route
 * used in the exported boltwallConfig ROUTE_CAVEAT_CONFIGS
 * @type Satisfier
 */
const routeSatisfier: Satisfier = {
  condition: 'route',
  satisfyFinal: (caveat: Caveat, req: Request) => {
    const path = req.path
    if (caveat.condition === 'route' && (caveat.value === path || caveat.value === MASTER_ROUTE)) return true
    else return false
  },
}

export default routeSatisfier