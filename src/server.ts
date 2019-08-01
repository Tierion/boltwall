// using this file primarily to test the middleware.
// this is a dummy server file

import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'

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

app.use(boltwall)

/******
Any middleware our route passed after this point will be protected and require
payment
******/

app.get('/protected', (_req, res: express.Response) =>
  res.json({ message: 'I should not be seen unless the invoice has been paid' })
)

app.listen(5000, () => console.log('listening on port 5000!'))
