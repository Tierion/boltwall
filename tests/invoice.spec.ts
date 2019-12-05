import * as request from 'supertest'
import { expect } from 'chai'

import app from '../src/app'

import { getStub } from './utilities'

describe('/inovoice', () => {
  let getInvStub: sinon.SinonStub, createInvStub: sinon.SinonStub

  before(() => {
    getInvStub = getStub('getInvoice')
    createInvStub = getStub('createInvoice')
  })

  after(() => {
    getInvStub.restore()
    createInvStub.restore()
  })

  describe('GET /invoice', () => {
    it('should return 401 if no macaroon present', async () => {
      const response: request.Response = await request
        .agent(app)
        .get('/invoice')

      console.log('response:', Object.keys(response))
      console.log('headers:', response.header)

      expect(response.status).to.equal(401)
      expect(response.header['www-authenticate']).to.exist
      if (response.header['www-authenticate']) {
        const header = response.header['www-authenticate']
        expect(header.includes('LSAT')).to.be.true
      }
    })
    xit('should return 400 if no invoice id in the macaroon', async () => {})
    xit('should return 404 if requested invoice does not exist', async () => {})
    xit('should return return invoice information w/ status for request w/ valid LSAT macaroon', async () => {
      // test for paid, unpaid, and held
    })
  })

  describe('POST /invoice', () => {
    xit('should return a new invoice with expected description and payment amt', async () => {})
  })
})
