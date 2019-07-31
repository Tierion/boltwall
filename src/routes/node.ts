import express, { Response, Router } from 'express'
const lnService = require('ln-service')

import { LndRequest } from '../typings/request'

const router: Router = express.Router()

router.get('/node', async (req: LndRequest, res: Response) => {
  if (req.lnd) {
    const { public_key, alias } = await lnService.getWalletInfo({
      lnd: req.lnd,
    })
    return res.status(200).json({
      pubKey: public_key,
      alias,
    })
  } else if (req.opennode)
    // this is a kind of stand-in, a best guess at what the pubkey for the opennode
    // node is. Probably need to change this or find another way to get better
    // connected with the paywall's node. Also need to differentiate between main and testnet
    return res.status(200).json({
      identityPubkey:
        '02eadbd9e7557375161df8b646776a547c5cbc2e95b3071ec81553f8ec2cea3b8c@18.191.253.246:9735',
    })
  else
    return res
      .status(404)
      .json({ message: 'No public key information found for node' })
})

export default router
