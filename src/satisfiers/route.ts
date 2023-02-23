import { Satisfier, Caveat } from 'lsat-js'
import { Request } from 'express'

/**
 * @description A satisfier for validating caveats based on the original route
 * used in the exported boltwallConfig ROUTE_CAVEAT_CONFIGS
 * @type Satisfier
 */
const routeSatisfier: Satisfier = {
  condition: 'route',
  satisfyFinal: (caveat: Caveat, req: Request) => {
    const master = req.boltwallConfig?.masterRoute
    let pathMatches
    if(req.boltwallConfig?.allowSubroutes) {
      pathMatches = (req.path+'/').startsWith(caveat.value+'/')
    } else pathMatches = (caveat.value === req.path)
    if (caveat.condition === 'route' && (pathMatches || caveat.value === master)) return true
    else return false
  },
}

export { routeSatisfier }