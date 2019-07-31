import express from 'express'
import cookieSession from 'cookie-session'
const cors = require('cors')
var bodyParser = require('body-parser')

const app: express.Application = express()

// middleware
app.use(cors())
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))
// parse application/json
app.use(bodyParser.json())

// a session cookie to store request macaroons in
app.use(
  cookieSession({
    name: 'macaroon',
    maxAge: 86400000,
    secret: process.env.SESSION_SECRET,
    overwrite: true,
    signed: true,
  })
)

// separate cookie for the discharge macaroon
app.use(
  cookieSession({
    name: 'dischargeMacaroon',
    maxAge: 86400000,
    secret: process.env.SESSION_SECRET,
    overwrite: true,
    signed: true,
  })
)
