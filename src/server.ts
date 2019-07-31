// using this file primarily to test the middleware.
// this is a dummy server file

import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'

import boltWall from '.'

const app: express.Application = express()

// middleware
app.use(cors())
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))
// parse application/json
app.use(bodyParser.json())

app.use('/bolt', boltWall)

app.get('/', (_req: any, res: express.Response) => {
  console.log('testing home route')
  return res.json({ message: 'success!' })
})

app.listen(5000, () => console.log('listening on port 5000!'))
