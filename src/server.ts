// using this file primarily to test the middleware.
// this is a dummy server file

import express from 'express'
import cookieSession from 'cookie-session'
import cors from 'cors'
import bodyParser from 'body-parser'

import { node, invoice } from './routes'
import { parseEnvVars } from './middleware'
import { getEnvVars } from './helpers'

const app: express.Application = express()

// middleware
app.use(cors())
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))
// parse application/json
app.use(bodyParser.json())

const { SESSION_SECRET } = getEnvVars()

const keys = SESSION_SECRET ? [SESSION_SECRET] : []

// check env vars before anything else
app.use('*', parseEnvVars)

// a session cookie to store request macaroons in
app.use(
  cookieSession({
    name: 'macaroon',
    maxAge: 86400000,
    secret: SESSION_SECRET,
    keys,
    overwrite: true,
    signed: true,
  })
)

// separate cookie for the discharge macaroon
app.use(
  cookieSession({
    name: 'dischargeMacaroon',
    maxAge: 86400000,
    secret: SESSION_SECRET,
    keys,
    overwrite: true,
    signed: true,
  })
)

app.get('/', (_req: any, res: express.Response) => {
  console.log('testing home route')
  return res.json({ message: 'success!' })
})

app.use('/node', node)
app.use('/invoice', invoice)

app.listen(5000, () => console.log('listening on port 5000!'))
