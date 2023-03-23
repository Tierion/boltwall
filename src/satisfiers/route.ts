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
    const requestedPath = !req.path.endsWith('/') ? req.path+'/' : req.path
    const caveatPath = !String(caveat.value).endsWith('/') ? caveat.value+'/' : String(caveat.value)
    let pathMatches
    if(req.boltwallConfig?.allowSubroutes) {
      pathMatches = requestedPath.startsWith(caveatPath)
    } else pathMatches = (caveat.value === req.path)
    if (caveat.condition === 'route' && (pathMatches || caveat.value === master)) return true
    else return false
  },
}

export { routeSatisfier }