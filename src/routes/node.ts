import express, { Response, Router } from 'express'
const lnService = require('ln-service')

import { getEnvVars } from '../helpers'
import { LndRequest, NodeInfo } from '../typings'

const router: Router = express.Router()

/**
 * Retrieve relevant connection info about lightning node
 * @params {LndRequest} req - expressjs request object decorated for middleware
 * @params {Response} res - expressjs response object
 * @returns {Promise<NodeInfo>} returns an express response with the node information
 */
const getNodeInfo = async (
  req: LndRequest,
  res: Response
): Promise<Response> => {
  try {
    let nodeInfo: NodeInfo
    if (req.lnd) {
      const { LND_SOCKET } = getEnvVars()
      const {
        public_key: pubKey,
        alias,
        active_channels_count: activeChannelsCount,
        peers_count: peersCount,
      } = await lnService.getWalletInfo({
        lnd: req.lnd,
      })
      nodeInfo = {
        pubKey,
        alias,
        socket: LND_SOCKET,
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
        socket: '18.191.253.246:9735',
        alias: 'OpenNode',
      }
    else
      return res
        .status(404)
        .json({ message: 'No public key information found for node' })
    return res.status(200).json(nodeInfo)
  } catch (e) {
    console.error('Problem connecting to node:', e)
    return res
      .status(500)
      .json({ message: 'Problem connecting to lightning node provider.' })
  }
}

router.get('/node', getNodeInfo)

export default router
