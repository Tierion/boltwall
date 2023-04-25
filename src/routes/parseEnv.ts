import { Request, Response, NextFunction } from 'express'
import * as fs from 'fs'
import isBase64 from 'is-base64'
import lnService from 'ln-service'

import { getEnvVars, isHex, testEnvVars } from '../helpers'
import loadCln from '../configs/cln'

// testEnvVars,

// import * as grpc from 'grpc'

export default async function parseEnv(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // const {
    //   LND_TLS_CERT,
    //   LND_MACAROON,
    //   LND_SOCKET,
    //   CLN_TLS_LOCATION,
    //   CLN_TLS_KEY_LOCATION,
    //   CLN_TLS_CHAIN_LOCATION,
    //   CLN_URI,
    // } = process.env

    testEnvVars(req.logger)
    const {
      OPEN_NODE_KEY,
      LND_TLS_CERT,
      LND_MACAROON,
      LND_SOCKET,
      CLN,
      CLN_TLS_LOCATION,
      CLN_TLS_CHAIN_LOCATION,
      CLN_TLS_KEY_LOCATION,
      CLN_URI,
    } = getEnvVars()

    // If LND vars aren't base64 strings, assume they are files
    let mac: string | undefined = LND_MACAROON
    let lndCert: string | undefined = LND_TLS_CERT
    if (mac && !isBase64(LND_MACAROON) && !isHex(mac)) {
      mac = Buffer.from(fs.readFileSync(mac)).toString('base64')
    }
    if (lndCert && !isBase64(lndCert) && !isHex(lndCert)) {
      lndCert = Buffer.from(fs.readFileSync(lndCert)).toString('base64')
    }
    //Try loading CLN first
    if (CLN) {
      const cln = await loadCln(
        CLN_TLS_LOCATION as string,
        CLN_TLS_KEY_LOCATION as string,
        CLN_TLS_CHAIN_LOCATION as string,
        CLN_URI as string
      )
      req.cln = cln
    }
    // if the tests pass above and we don't have a
    // OPEN_NODE_KEY then we need to setup the lnd service
    else if (!OPEN_NODE_KEY) {
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
