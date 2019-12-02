import * as request from 'supertest'
import { expect } from 'chai'

import app from '../src/app'
import { nodeInfo } from './data'
import { getStub } from './utilities'

describe('/node', () => {
  let getInfoStub: sinon.SinonStub

  before(() => {
    getInfoStub = getStub('getWalletInfo', nodeInfo)
  })
  after(() => {
    getInfoStub.restore()
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
