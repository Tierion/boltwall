import * as request from 'supertest'
import { expect } from 'chai'
import { Application } from 'express'

import getApp from './mockApp'
import { nodeInfo } from './data'
import { getLnStub } from './utilities'

describe('/node', () => {
  let getInfoStub: sinon.SinonStub,
    lndGrpcStub: sinon.SinonStub,
    app: Application

  before(() => {
    getInfoStub = getLnStub('getWalletInfo', nodeInfo)
    // stub authentication to speed up tests
    lndGrpcStub = getLnStub('authenticatedLndGrpc', { lnd: {} })
    app = getApp()
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
