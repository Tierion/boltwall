import * as request from 'supertest'
import { expect } from 'chai'
import sinon from 'sinon'
import { Application } from 'express'
import { MacaroonInterface, Lsat, Caveat } from 'lsat-js'
import crypto from 'crypto'

import * as helpers from '../src/helpers'
import {
  getLnStub,
  getTestBuilder,
  getEnvStub,
  getSerializedMacaroon,
} from './utilities'
import { invoiceResponse, nodeInfo, invoiceDetails } from './fixtures'
import getApp from './mockApp'
import { InvoiceResponse } from '../src/typings'

const route = '/token'

describe(route, () => {
  let lndGrpcStub: sinon.SinonStub,
    sessionSecret: string,
    envStub: sinon.SinonStub,
    app: Application

  before(() => {
    // boltwall sets up authenticated client when it boots up
    // need to stub this to avoid connection errors and speed up tests
    lndGrpcStub = getLnStub('authenticatedLndGrpc', { lnd: {} })
    // keep known session secret so we can decode macaroons
    sessionSecret = 'my super secret'
    envStub = getEnvStub(sessionSecret)
    app = getApp({ oauth: true })
  })

  after(() => {
    lndGrpcStub.restore()
    envStub.restore()
  })

  describe('POST', () => {
    let checkInvoiceStub: // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sinon.SinonStub<any> | sinon.SinonStub<InvoiceResponse[]>,
      checkInvResponse: InvoiceResponse,
      macaroon: MacaroonInterface,
      challengeCaveat: string,
      getInfoStub: sinon.SinonStub,
      signMessageStub: sinon.SinonStub,
      signature: string

    beforeEach(() => {
      signature = crypto.randomBytes(32).toString('hex')
      signMessageStub = getLnStub('signMessage', { signature })

      checkInvoiceStub = sinon.stub(helpers, 'checkInvoiceStatus')
      // setting nodeInfo's public key to match the destination node in the invocie
      getInfoStub = getLnStub('getWalletInfo', {
        ...nodeInfo,
        public_key: invoiceDetails.destination,
      })
      checkInvResponse = {
        id: invoiceResponse.id,
        payreq: invoiceResponse.request,
        createdAt: invoiceResponse.created_at,
        amount: invoiceResponse.tokens,
        secret: invoiceResponse.secret,
        description: invoiceResponse.description,
      }
      const builder = getTestBuilder(sessionSecret)
      challengeCaveat = helpers.createChallengeCaveat(invoiceResponse.request)
      builder.addFirstPartyCaveat(challengeCaveat)
      macaroon = getSerializedMacaroon(builder)
    })

    afterEach(() => {
      checkInvoiceStub.restore()
      getInfoStub.restore()
      signMessageStub.restore()
    })

    it('should return 400 if request body is missing macaroon', async () => {
      const res: request.Response = await request
        .agent(app)
        .post(route)
        .send({})

      expect(res.status).to.equal(400)
      expect(res.body.error).to.exist
      expect(res.body.error.message.toLowerCase()).to.include(
        'missing macaroon'
      )
    })

    it('should return 400 if macaroon is missing challenge caveat', async () => {
      let invalidMacaroon = getTestBuilder(sessionSecret)
      invalidMacaroon = getSerializedMacaroon(invalidMacaroon)
      const res: request.Response = await request
        .agent(app)
        .post(route)
        .send({ macaroon: invalidMacaroon })

      expect(res.status).to.equal(400)
      expect(res.body.error).to.exist
      expect(res.body.error.message.toLowerCase()).to.include(
        'missing challenge caveat'
      )
    })

    it('should return 400 if invoice destination does not match node pubkey', async () => {
      getInfoStub.resetBehavior()
      // set info to return a blank pubkey so they won't match
      getInfoStub.returns({
        ...nodeInfo,
        public_key: Buffer.alloc(33).toString('hex'),
      })

      const res: request.Response = await request
        .agent(app)
        .post(route)
        .send({ macaroon })

      expect(res.status).to.equal(400)
      expect(res.body.error).to.exist
      expect(res.body.error.message.toLowerCase()).to.include(
        'unknown public key'
      )
    })

    it('should return 402 if invoice is unpaid', async () => {
      checkInvoiceStub.returns({ ...checkInvResponse, status: 'unpaid' })

      const res: request.Response = await request
        .agent(app)
        .post(route)
        .send({ macaroon })

      expect(res.status).to.equal(402)
    })

    it('should return new macaroon in response body', async () => {
      checkInvoiceStub.returns({ ...checkInvResponse, status: 'paid' })

      const res: request.Response = await request
        .agent(app)
        .post(route)
        .send({ macaroon })

      expect(res.status).to.equal(200)
      expect(res.body.macaroon).to.exist
    })

    it('should add new challenge caveat with valid signature', async () => {
      checkInvoiceStub.returns({ ...checkInvResponse, status: 'paid' })

      const res: request.Response = await request
        .agent(app)
        .post(route)
        .send({ macaroon })

      const lsat = Lsat.fromMacaroon(res.body.macaroon)
      const caveats = lsat.getCaveats().filter(c => c.condition === 'challenge')

      // it should have at least two challenge caveats now
      // one without and one with signature
      expect(caveats).to.have.length.greaterThan(1)

      // last caveat should have signature
      const caveat = caveats[caveats.length - 1]
      const decoded = helpers.decodeChallengeCaveat(caveat.encode())
      expect(decoded).to.have.property('signature')
      expect(decoded.signature).to.equal(signature)
    })

    it('should add other caveats from boltwallConfig', async () => {
      const caveat = new Caveat({ condition: 'middlename', value: 'nakamoto' })
      app = getApp({ oauth: true, getCaveats: () => caveat.encode() })
      checkInvoiceStub.returns({ ...checkInvResponse, status: 'paid' })

      const res: request.Response = await request
        .agent(app)
        .post(route)
        .send({ macaroon })

      expect(res.status).to.equal(200)
      const lsat = Lsat.fromMacaroon(res.body.macaroon)

      const customCaveat = lsat
        .getCaveats()
        .find(c => c.condition === caveat.condition)

      expect(customCaveat).to.exist
    })
  })
})
