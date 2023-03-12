import { Satisfier, Caveat } from 'lsat-js'
import { Request } from 'express'

/**
 * @description A satisfier for validating caveats by comparing the route
 * the LSAT was created for and the requested path. A valid LSAT 
 * created at the master route will work regardless the requested path.
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