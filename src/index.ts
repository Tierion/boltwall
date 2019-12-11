import { Response, NextFunction, Request } from 'express'
import cookieSession from 'cookie-session'
import { compose } from 'compose-middleware'
import Logger from 'blgr'
import { node, invoice, parseEnv, paywall, hodl, validateLsat } from './routes'
import { getEnvVars } from './helpers'
import { LndRequest, BoltwallConfig, LoggerInterface } from './typings'

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

function errorHandler(
  err: any,
  req: LndRequest,
  res: Response,
  next: NextFunction
): void | Response {
  if (res.headersSent) {
    return next(err)
  }
  if (err.stack) {
    req.logger.error('Error:', err.stack)
  }
  if (err) return res.json({ error: err })
}

async function getLogger(level = 'none'): Promise<LoggerInterface> {
  const logger = new Logger({ level })
  await logger.open()
  return logger
}

export function boltwall(
  config: BoltwallConfig,
  logger: LoggerInterface
): Function {
  if (config) {
    const { CAVEAT_KEY } = getEnvVars()
    if (config.getCaveat && !CAVEAT_KEY)
      throw new Error(
        'Missing CAVEAT_KEY environment variable. This is required when creating a custom authorization \
rule with `getCaveat` config. Read more in the docs: https://github.com/Tierion/boltwall#configuration'
      )
  }

  return async (
    req: LndRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> => {
    // if logger was not passed in then we use default blgr
    if (!logger) req.logger = await getLogger(process.env.LOG_LEVEL)
    else req.logger = logger
    req.boltwallConfig = config
    return compose([
      parseEnv,
      rootMacaroon,
      dischargeMacaroon,
      node,
      invoice,
      hodl,
      validateLsat,
      paywall,
      errorHandler,
    ])(req, res, next)
  }
}

// expose common configs
export { TIME_CAVEAT_CONFIGS } from './configs'
export { getFirstPartyCaveatFromMacaroon } from './helpers'
