import express, { Response, Request, NextFunction } from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import { BoltwallConfig } from './typings'

const {
  boltwall,
  TIME_CAVEAT_CONFIGS,
  ORIGIN_CAVEAT_CONFIGS,
  ROUTE_CAVEAT_CONFIGS
} = require('./index')

const app: express.Application = express()

// Required middleware - These must be used in any boltwall project
app.use(cors())
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))
// parse application/json
app.use(bodyParser.json())

app.use((req: Request, _res: Response, next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.log(`${req.method} ${req.path}`)
  next()
})

// This route is before the boltwall and will not require payment
app.get('/', (_req, res: express.Response) => {
  res.json({ message: 'success!' })
  return
})

/**
 * Boltwall accepts a config object as an argument.
 * With this configuration object, the server/api admin
 * can setup custom caveats for restricting access to protected content
 * For example, in this config, we have a time based caveat, where each
 * satoshi of payment allows access for 1 second. caveatVerifier uses
 * the available time based caveat verifier, however this can also be customized.
 * getInvoiceDescription allows the admin to generate custom descriptions in the
 * lightning invoice
 */

const {
  PORT,
  TIME_CAVEAT,
  ORIGIN_CAVEAT,
  ROUTE_CAVEAT,
  BOLTWALL_OAUTH,
  BOLTWALL_HODL,
  BOLTWALL_MIN_AMOUNT,
  BOLTWALL_RATE,
} = process.env
let options: BoltwallConfig = {}
if (TIME_CAVEAT) options = TIME_CAVEAT_CONFIGS
if (ORIGIN_CAVEAT) options = ORIGIN_CAVEAT_CONFIGS
if (ROUTE_CAVEAT) options = ROUTE_CAVEAT_CONFIGS
if (BOLTWALL_OAUTH) options.oauth = true
if (BOLTWALL_HODL) options.hodl = true
if (BOLTWALL_RATE) options.rate = +BOLTWALL_RATE
if (BOLTWALL_MIN_AMOUNT) options.minAmount = BOLTWALL_MIN_AMOUNT
app.use(boltwall(options))

/******
Any middleware our route passed after this point will be protected and require
payment
******/
export const protectedRoute = '/protected'
app.get(protectedRoute, (_req, res: express.Response) =>
  res.json({
    message:
      'Protected route! This message will only be returned if an invoice has been paid',
  })
)

app.set('port', PORT || 5000)

app.listen(app.get('port'), () => {
  //eslint-disable-next-line
  console.log(`listening on port ${app.get('port')}!`)
})
