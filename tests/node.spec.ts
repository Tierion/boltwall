import * as request from 'supertest'
import { expect } from 'chai'

import app from '../src/app'
import { nodeInfo } from './data'
import { getLnStub } from './utilities'

describe('/node', () => {
  let getInfoStub: sinon.SinonStub, lndGrpcStub: sinon.SinonStub

  before(() => {
    getInfoStub = getLnStub('getWalletInfo', nodeInfo)
    // stub authentication to speed up tests
    lndGrpcStub = getLnStub('authenticatedLndGrpc', { lnd: {} })
  })
  after(() => {
    getInfoStub.restore()
    lndGrpcStub.restore()
  })
  describe('GET /node', () => {
    it('should return expected information about the node', async () => {
      const response: request.Response = await request.agent(app).get('/node')

      const expectedResp = {
        pubKey: nodeInfo.public_key,
        alias: nodeInfo.alias,
        uris: nodeInfo.uris,
        activeChannelsCount: nodeInfo.active_channels_count,
        peersCount: nodeInfo.peers_count,
      }

      expect(response.body).to.deep.equal(expectedResp)
    })
  })
})
