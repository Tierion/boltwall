/**
 * @file An example server entry point that implements Boltwall for protected content
 * Developers can use this as a boilerplate for using Boltwall in their own application
 */

import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
const { verifier } = require('macaroons.js')

import {
  LndRequest,
  InvoiceResponse,
  BoltwallConfig,
  DescriptionGetter,
  CaveatVerifier,
  CaveatGetter,
} from './typings'
const boltwall = require('./index')

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

// These are custom functions passed into the boltwall middleware

/**
 * Creates a general caveat where the macaroon this is attached to
 * will only be valid for a designated amount of time, based on the invoice
 * amount paid
 */
const getCaveat: CaveatGetter = (
  _req: LndRequest,
  invoice: InvoiceResponse
) => {
  const amount =
    typeof invoice.amount === 'string'
      ? parseInt(invoice.amount, 10)
      : invoice.amount

  // amount is in satoshis which is equal to the amount of seconds paid for
  const milli: number = amount * 1000

  // add 200 milliseconds of "free time" as a buffer
  const time = new Date(Date.now() + milli + 200)
  return `time < ${time}`
}

/**
 * This example caveatVerifier method simply implements the
 * built in TimestamCaveatVerifier available in the macaroons.js pacakge
 */
const caveatVerifier: CaveatVerifier = (_req: LndRequest, caveat: string) =>
  verifier.TimestampCaveatVerifier(caveat)

/**
 * Generates a descriptive invoice description indicating more information
 * about the circumstances the invoice was created under
 */
const getInvoiceDescription: DescriptionGetter = (req: LndRequest) => {
  let { time, title, appName, amount } = req.body // time in seconds

  if (!appName) appName = `[unknown application @ ${req.ip}]`
  if (!title) title = '[unknown data]'
  if (!time) time = amount

  return `Access for ${time} seconds in ${appName} for requested data: ${title}`
}

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
const config: BoltwallConfig = {
  getCaveat,
  caveatVerifier,
  getInvoiceDescription,
}

app.use(boltwall(config))

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
