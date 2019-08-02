// using this file primarily to test the middleware.
// this is a dummy server file

import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
const { verifier } = require('macaroons.js')

import { LndRequest, InvoiceResponse, CaveatConfig } from './typings'
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
  console.log('testing home route')
  return res.json({ message: 'success!' })
})

// set of configurations for custom authorization
const config: CaveatConfig = {
  // create a caveat that limits access within a certain amount of
  // time directly linked to how much was paid in the invoice
  getCaveat: (_req: LndRequest, invoice: InvoiceResponse) => {
    const amount =
      typeof invoice.amount === 'string'
        ? parseInt(invoice.amount, 10)
        : invoice.amount

    // amount is in satoshis which is equal to the amount of seconds paid for
    const milli: number = amount * 1000

    // add 200 milliseconds of "free time" as a buffer
    const time = new Date(Date.now() + milli + 200)
    return `time < ${time}`
  },
  caveatVerifier: (_req: LndRequest, caveat: string) =>
    verifier.TimestampCaveatVerifier(caveat),
}

app.use(boltwall(config))

/******
Any middleware our route passed after this point will be protected and require
payment
******/

app.get('/protected', (_req, res: express.Response) =>
  res.json({ message: 'I should not be seen unless the invoice has been paid' })
)

app.listen(5000, () => console.log('listening on port 5000!'))
