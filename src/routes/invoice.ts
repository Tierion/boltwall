import express, { Response, Router } from 'express'

import { LndRequest } from '../typings/request'
import {
  createInvoice,
  checkInvoiceStatus,
  getDischargeMacaroon,
  getLocation,
  getFirstPartyCaveatFromMacaroon,
} from '../helpers'

const router: Router = express.Router()

router.post('/', async (req: LndRequest, res: Response) => {
  console.log('Request to create a new invoice')
  try {
    const invoice = await createInvoice(req)
    res.status(200).json(invoice)
  } catch (error) {
    console.error('error getting invoice:', error)
    res.status(400).json({ message: error.message })
  }
})

router.get('/', async (req: LndRequest, res: Response) => {
  let invoiceId = req.query.id

  // if the query doesn't have an id, but we have a root macaroon, we can
  // get the id from that
  if (!invoiceId && req.session && req.session.macaroon) {
    invoiceId = getFirstPartyCaveatFromMacaroon(req.session.macaroon)
  } else if (!invoiceId) {
    return res.status(400).json({ message: 'Missing invoiceId in request' })
  }

  try {
    console.log('checking status of invoice:', invoiceId)
    const { lnd, opennode } = req
    const { status, amount, payreq } = await checkInvoiceStatus(
      lnd,
      opennode,
      invoiceId
    )

    if (status === 'paid') {
      // amount is in satoshis which is equal to the amount of seconds paid for
      const milli = amount * 1000
      // add 200 milliseconds of "free time" as a buffer
      const time = new Date(Date.now() + milli + 200)
      const caveat = `time < ${time}`
      const location = getLocation(req)
      const macaroon = getDischargeMacaroon(invoiceId, location, caveat)

      // save discharge macaroon in a cookie. Request should have two macaroons now
      if (req.session) req.session.dischargeMacaroon = macaroon // tslint-disable-line

      console.log(
        `Invoice ${invoiceId} has been paid and is valid until ${time}`
      )

      return res.status(200).json({ status, discharge: macaroon.serialize() })
    } else if (status === 'processing' || status === 'unpaid') {
      console.log('still processing invoice %s...', invoiceId)
      return res.status(202).json({ status, payreq })
    } else {
      return res
        .status(400)
        .json({ message: `unknown invoice status ${status}` })
    }
  } catch (error) {
    console.error('error getting invoice:', error)
    res.status(400).json({ message: error.message })
  }
})

export default router
