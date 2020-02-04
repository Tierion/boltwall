import { Response, NextFunction, Request } from 'express'
import { compose } from 'compose-middleware'
import Logger from 'blgr'
import { node, invoice, parseEnv, paywall, validateLsat, token } from './routes'
import { BoltwallConfig, LoggerInterface } from './typings'

function errorHandler(
  err: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  req: Request,
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
  config?: BoltwallConfig,
  logger?: LoggerInterface
): Function {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> => {
    // if logger was not passed in then we use default blgr
    if (!logger) req.logger = await getLogger(process.env.LOG_LEVEL || 'info')
    else req.logger = logger
    req.boltwallConfig = config
    return compose([
      parseEnv,
      node,
      invoice,
      token,
      validateLsat,
      paywall,
      errorHandler,
    ])(req, res, next)
  }
}

// expose common configs
export { TIME_CAVEAT_CONFIGS, ORIGIN_CAVEAT_CONFIGS } from './configs'
