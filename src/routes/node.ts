import express, { Response, Router, NextFunction } from 'express'
const lnService = require('ln-service')

import { LndRequest, NodeInfo } from '../typings'

const router: Router = express.Router()

/**
 * Retrieve relevant connection info about lightning node
 * @param {LndRequest} req - expressjs request object decorated for middleware
 * @param {Response} res - expressjs response object
 * @returns {Promise<NodeInfo>} returns an express response with the node information
 */
const getNodeInfo = async (
  req: LndRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let nodeInfo: NodeInfo
    if (req.lnd) {
      const {
        public_key: pubKey,
        alias,
        active_channels_count: activeChannelsCount,
        peers_count: peersCount,
        uris,
      } = await lnService.getWalletInfo({
        lnd: req.lnd,
      })
      nodeInfo = {
        pubKey,
        alias,
        uris,
        activeChannelsCount,
        peersCount,
      }
    } else if (req.opennode)
      // this is a kind of stand-in, a best guess at what the pubkey for the opennode
      // node is. Probably need to change this or find another way to get better
      // connected with the paywall's node. Also need to differentiate between main and testnet
      nodeInfo = {
        pubKey:
          '02eadbd9e7557375161df8b646776a547c5cbc2e95b3071ec81553f8ec2cea3b8c',
        uris: [
          '02eadbd9e7557375161df8b646776a547c5cbc2e95b3071ec81553f8ec2cea3b8c@18.191.253.246:9735',
        ],
        alias: 'OpenNode',
      }
    else {
      res.status(404)
      return next({ message: 'No public key information found for node' })
    }
    res.status(200)
    res.json(nodeInfo)
    next()
  } catch (e) {
    console.error('Problem connecting to node:', e)
    res.status(500)
    return next({
      message: 'Problem connecting to lightning node provider.',
    })
  }
}

router.route('*/node').get(getNodeInfo)

export default router
