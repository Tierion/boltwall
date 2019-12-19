/**
 * @file a testing server for hodl endpoints
 * Made as a separate file so we can set the hodl config
 * Needs to be done here rather than in the test because for some reason
 * Typescript complains about boltwall being added from within the tests
 */

import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import { BoltwallConfig } from '../src/typings'

const { boltwall } = require('../src/index')

export const protectedRoute = '/protected'

export default function getApp(configs?: BoltwallConfig): express.Application {
  // mock env vars for testing
  process.env = {
    ...process.env,
    LND_TLS_CERT: '123',
    LND_SOCKET: 'localhost:10001',
    LND_MACAROON: '1234',
  }

  const app: express.Application = express()

  // Required middleware - These must be used in any boltwall project
  app.use(cors())
  // parse application/x-www-form-urlencoded
  app.use(bodyParser.urlencoded({ extended: false }))
  // parse application/json
  app.use(bodyParser.json())

  // This route is before the boltwall and will not require payment
  app.get('/', (_req, res: express.Response) => {
    res.json({ message: 'success!' })
    return
  })

  app.use(boltwall(configs))

  // /******
  // Any middleware our route passed after this point will be protected and require
  // payment
  // ******/
  app.get(protectedRoute, (_req, res: express.Response) =>
    res.json({
      message:
        'Protected route! This message will only be returned if an invoice has been paid',
    })
  )

  return app
}
