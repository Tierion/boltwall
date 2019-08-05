/**
 * @file An example server entry point that implements Boltwall for protected content
 * Developers can use this as a boilerplate for using Boltwall in their own application
 */

import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'

const { boltwall, TIME_CAVEAT_CONFIGS } = require('./index')

const app: express.Application = express()

// Required middleware - These must be used in any boltwall project
app.use(cors())
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))
// parse application/json
app.use(bodyParser.json())

// This route is before the boltwall and will not require payment
app.get('/', (_req: any, res: express.Response) => {
  return res.json({ message: 'success!' })
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

app.use(boltwall(TIME_CAVEAT_CONFIGS))

/******
Any middleware our route passed after this point will be protected and require
payment
******/

app.get('/protected', (_req, res: express.Response) =>
  res.json({
    message:
      'Protected route! This message will only be returned if an invoice has been paid',
  })
)

app.listen(5000, () => console.log('listening on port 5000!'))
