import cookieSession from 'cookie-session'
import { compose } from 'compose-middleware'

import { node, invoice } from './routes'
import { parseEnvVars } from './middleware'
import { getEnvVars } from './helpers'

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

export default compose([
  parseEnvVars,
  rootMacaroon,
  dischargeMacaroon,
  node,
  invoice,
])
