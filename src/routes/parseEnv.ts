import { Request, Response, NextFunction } from 'express'
import * as fs from 'fs'
import isBase64 from 'is-base64'
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

    // If LND vars aren't base64 strings, assume they are files
    let mac: string | undefined = LND_MACAROON
    let lndCert: string | undefined = LND_TLS_CERT
    if (mac && !isBase64(mac)) {
      mac = new Buffer(fs.readFileSync(mac)).toString('base64')
    }
    if (lndCert && !isBase64(lndCert)) {
      lndCert = new Buffer(fs.readFileSync(lndCert)).toString('base64')
    }

    // if the tests pass above and we don't have a
    // OPEN_NODE_KEY then we need to setup the lnd service
    if (!OPEN_NODE_KEY) {
      const { lnd } = lnService.authenticatedLndGrpc({
        cert: lndCert,
        macaroon: mac,
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
      e.message || e
    )
    next("Could not connect to the paywall's lightning node.")
  }
}
