import * as request from 'supertest'
import { expect } from 'chai'
import sinon from 'sinon'
import { Application } from 'express'
import { parsePaymentRequest } from 'ln-service'
import { Lsat, expirationSatisfier } from 'lsat-js'

import getApp from './mockApp'

import {
  getLnStub,
  getTestBuilder,
  getEnvStub,
  getExpirationCaveat,
  getSerializedMacaroon,
} from './utilities'
import { invoice } from './data'

import { InvoiceResponse } from '../src/typings'

interface InvoiceResponseStub {
  request: string
  is_confirmed: boolean
  id: string
  secret: string
  tokens: number
  created_at: string
  description: string
}

describe('/invoice', () => {
  let getInvStub: sinon.SinonStub,
    createInvStub: sinon.SinonStub,
    envStub: sinon.SinonStub,
    lndGrpcStub: sinon.SinonStub,
    invoiceResponse: InvoiceResponseStub,
    sessionSecret: string,
    builder: any,
    app: Application,
    basePath: string,
    validPath: string

  beforeEach(() => {
    // boltwall sets up authenticated client when it boots up
    // need to stub this to avoid connection errors and speed up tests
    lndGrpcStub = getLnStub('authenticatedLndGrpc', { lnd: {} })
    // keep known session secret so we can decode macaroons
    sessionSecret = 'my super secret'

    envStub = getEnvStub(sessionSecret)

    const request = parsePaymentRequest({ request: invoice.payreq })

    // stubbed response for invoice related requests made through ln-service
    invoiceResponse = {
      request: invoice.payreq,
      is_confirmed: true,
      id: request.id,
      secret: invoice.secret,
      tokens: 30,
      created_at: '2016-08-29T09:12:33.001Z',
      description: request.description,
    }
    basePath = `/invoice`
    validPath = `${basePath}?id=${invoiceResponse.id}`
    builder = getTestBuilder(sessionSecret)

    getInvStub = getLnStub('getInvoice', invoiceResponse)
    createInvStub = getLnStub('createInvoice', {
      ...invoiceResponse,
      is_confirmed: false,
      secret: undefined,
    })
    app = getApp()
  })

  afterEach(() => {
    getInvStub.restore()
    envStub.restore()
    createInvStub.restore()
    lndGrpcStub.restore()
  })

  describe('GET', () => {
    it('should return 400 Bad Request when missing id in query parameter', async () => {
      const response1: request.Response = await request.agent(app).get(basePath)
      const response2: request.Response = await request
        .agent(app)
        .get(`${basePath}?id=12345`)

      for (const resp of [response1, response2]) {
        expect(resp.status).to.equal(400)
        expect(resp).to.have.nested.property('body.error.message')
        expect(resp.body.error.message).to.match(/Bad Request/g)
        expect(resp.body.error.message).to.match(/payment hash/g)
      }
    })

    it('should return 401 if sent with expired LSAT', async () => {
      const expirationCaveat = getExpirationCaveat(-100)

      builder.addFirstPartyCaveat(expirationCaveat.encode())

      const lsat = Lsat.fromMacaroon(getSerializedMacaroon(builder))

      const response: request.Response = await request
        .agent(app)
        .get(basePath)
        .set('Authorization', lsat.toToken())

      expect(response.status).to.equal(401)
      expect(response).to.have.nested.property('body.error.message')
      // confirm it gives an error message about an expired macaroon
      expect(response.body.error.message).to.match(/expired/g)
    })

    it('should return 401 if sent with LSAT that has invalid signature', async () => {
      const macaroon = getTestBuilder('another secret')

      const response: request.Response = await request
        .agent(app)
        .get(basePath)
        .set('Authorization', `LSAT ${getSerializedMacaroon(macaroon)}:`)

      expect(response.status).to.equal(401)
      expect(response).to.have.nested.property('body.error.message')
    })

    it('should return 404 if requested invoice does not exist', async () => {
      // Setup response from getInvoice with response that it could not be found
      getInvStub.restore()

      getInvStub = getLnStub('getInvoice')
      getInvStub.throws(() => [
        503,
        'UnexpectedLookupInvoiceErr',
        { details: 'unable to locate invoice' },
      ])

      const response: request.Response = await request.agent(app).get(validPath)

      expect(response.status).to.equal(404)
      expect(response).to.have.nested.property('body.error.message')

      // expect some kind of message that tells us the invoice is missing
      expect(response.body.error.message).to.match(/invoice/g)
    })

    it('should return invoice information w/ status for valid requests', async () => {
      const response: InvoiceResponse = {
        id: invoiceResponse.id,
        payreq: invoiceResponse.request,
        createdAt: invoiceResponse.created_at,
        amount: invoiceResponse.tokens,
        status: 'paid',
        description: invoiceResponse.description,
      }

      // add extra expiration caveats. it should pass if newer is more restrictive
      // but not yet past current time
      builder.addFirstPartyCaveat(`expiration=${Date.now() + 500}`)
      const macaroon = getSerializedMacaroon(builder)
      app = getApp({ caveatSatisfiers: expirationSatisfier })

      // first test just with the invoice id in the request query parameter
      let supertestResp: request.Response = await request
        .agent(app)
        .get(validPath)

      expect(supertestResp.body).to.eql(response)

      // test next with a paid invoice and LSAT sent in the request
      // this should include the secret
      response.secret = invoiceResponse.secret
      supertestResp = await request
        .agent(app)
        .get(basePath)
        .set('Authorization', `LSAT ${macaroon}:`)

      expect(supertestResp.body).to.eql(response)
    })

    it('should not return the secret if invoice is unpaid or LSAT is invalid', async () => {
      const macaroon = getSerializedMacaroon(builder)

      // Setup response from getInvoice w/ unconfirmed invoice
      getInvStub.restore()
      getInvStub = getLnStub('getInvoice', {
        ...invoiceResponse,
        is_confirmed: false,
      })

      const response: request.Response = await request
        .agent(app)
        .get('/invoice')
        .set('Authorization', `LSAT ${macaroon}:`)

      expect(response.body).to.not.have.property('error')
      expect(response.body).to.not.have.property('secret')
    })
  })

  describe('POST', () => {
    let response: InvoiceResponse
    beforeEach(() => {
      response = {
        id: invoiceResponse.id,
        payreq: invoiceResponse.request,
        createdAt: invoiceResponse.created_at,
        amount: invoiceResponse.tokens,
        description: invoiceResponse.description,
      }
    })

    it('should return a new invoice with expected description and payment amt', async () => {
      // TODO: Do we want to rate limit this or require a macaroon at all to avoid DDoS?
      const supertestResp: request.Response = await request
        .agent(app)
        .post('/invoice')
        .send({ amount: 100 })

      expect(supertestResp.body).to.eqls(response)
    })
  })
})
