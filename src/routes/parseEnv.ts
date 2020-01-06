import { Request, Response, NextFunction } from 'express'
import lnService from 'ln-service'

import { testEnvVars, getEnvVars } from '../helpers'

export default function parseEnv(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  try {
    testEnvVars(req.logger)
    const {
      OPEN_NODE_KEY,
      LND_TLS_CERT,
      LND_MACAROON,
      LND_SOCKET,
    } = getEnvVars()
    // if the tests pass above and we don't have a
    // OPEN_NODE_KEY then we need to setup the lnd service
    if (!OPEN_NODE_KEY) {
      const { lnd } = lnService.authenticatedLndGrpc({
        cert: LND_TLS_CERT,
        macaroon: LND_MACAROON,
        socket: LND_SOCKET,
      })
      req.lnd = lnd
    } else {
      const env = process.env.ENVIRONMENT || 'dev'
      const opennode = require('opennode')
      opennode.setCredentials(OPEN_NODE_KEY, env)
      req.opennode = opennode
    }
    next()
  } catch (e) {
    req.logger.error(
      'Problem with configs for connecting to lightning node:',
      e.message
    )
    next("Could not connect to the paywall's lightning node.")
  }
}
