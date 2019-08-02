import { Response, NextFunction } from 'express'
import cookieSession from 'cookie-session'
import { compose } from 'compose-middleware'

import { node, invoice, parseEnv, boltwall as paywall } from './routes'
import { getEnvVars } from './helpers'
import { LndRequest, CaveatConfig } from './typings'

const { SESSION_SECRET } = getEnvVars()

const keys = SESSION_SECRET ? [SESSION_SECRET] : []

// a session cookie to store request macaroons in
const rootMacaroon = cookieSession({
  name: 'macaroon',
  maxAge: 86400000,
  secret: SESSION_SECRET,
  keys,
  overwrite: true,
  signed: true,
})

// separate cookie for the discharge macaroon
const dischargeMacaroon = cookieSession({
  name: 'dischargeMacaroon',
  maxAge: 86400000,
  secret: SESSION_SECRET,
  keys,
  overwrite: true,
  signed: true,
})

function boltwall(config: CaveatConfig): Function {
  return (req: LndRequest, res: Response, next: NextFunction) => {
    req.caveatConfig = config
    return compose([
      parseEnv,
      rootMacaroon,
      dischargeMacaroon,
      node,
      invoice,
      paywall,
    ])(req, res, next)
  }
}

module.exports = boltwall
