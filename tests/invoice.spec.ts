import * as request from 'supertest'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { parsePaymentRequest } from 'ln-service'
import { MacaroonsBuilder } from 'macaroons.js'

import { Lsat } from '../src/lsat'
import app from '../src/app'

import {
  getLnStub,
  getTestBuilder,
  getEnvStub,
  BuilderInterface,
  getExpirationCaveat,
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
    builder: BuilderInterface

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

    builder = getTestBuilder(sessionSecret)

    getInvStub = getLnStub('getInvoice', invoiceResponse)
    createInvStub = getLnStub('createInvoice', {
      ...invoiceResponse,
      is_confirmed: false,
      secret: undefined,
    })
  })

  afterEach(() => {
    getInvStub.restore()
    envStub.restore()
    createInvStub.restore()
    lndGrpcStub.restore()
  })

  describe('GET /invoice', () => {
    it('should return 400 Bad Request when no macaroon to check', async () => {
      const response1: request.Response = await request
        .agent(app)
        .get('/invoice')
      const response2: request.Response = await request
        .agent(app)
        .get('/invoice')
        .set('Authorization', 'Basic')

      for (const resp of [response1, response2]) {
        expect(resp.status).to.equal(400)
        expect(resp).to.have.nested.property('body.error.message')
        expect(resp.body.error.message).to.match(/Bad Request/g)
        expect(resp.body.error.message).to.match(/LSAT/g)
      }
    })

    it('should return 401 if macaroon is expired', async () => {
      const expirationCaveat = getExpirationCaveat(-100)

      const macaroon = builder
        .add_first_party_caveat(expirationCaveat.encode())
        .getMacaroon()
        .serialize()

      const lsat = Lsat.fromMacaroon(macaroon)

      const response: request.Response = await request
        .agent(app)
        .get('/invoice')
        .set('Authorization', lsat.toToken())

      expect(response.status).to.equal(401)
      expect(response).to.have.nested.property('body.error.message')
      // confirm it gives an error message about an expired macaroon
      expect(response.body.error.message).to.match(/expired/g)
    })

    it('should return 401 if macaroon has invalid signature', async () => {
      const macaroon = getTestBuilder('another secret')
        .getMacaroon()
        .serialize()

      const response: request.Response = await request
        .agent(app)
        .get('/invoice')
        .set('Authorization', `LSAT ${macaroon}:`)

      expect(response.status).to.equal(401)
      expect(response).to.have.nested.property('body.error.message')
    })

    it('should return 400 if no invoice id in the macaroon', async () => {
      const macaroon = new MacaroonsBuilder('location', 'secret', 'identifier')
        .getMacaroon()
        .serialize()
      const response: request.Response = await request
        .agent(app)
        .get('/invoice')
        .set('Authorization', `LSAT ${macaroon}:`)

      expect(response.status).to.equal(400)
      expect(response).to.have.nested.property('body.error.message')
      // confirm it gives an error message about a missing invoice
      expect(response.body.error.message).to.match(/malformed/i)
    })

    it('should return 404 if requested invoice does not exist', async () => {
      // create a macaroon that has an invoice attached to it but our getInvoice request
      // should return a fake error that the invoice wasn't found
      const macaroon = builder.getMacaroon().serialize()

      // Setup response from getInvoice with response that it could not be found
      getInvStub.restore()

      // TODO: confirm the error message and code when no invoice with that id is available
      getInvStub = getLnStub('getInvoice')
      getInvStub.throws(() => [
        503,
        'UnexpectedLookupInvoiceErr',
        { details: 'unable to locate invoice' },
      ])

      const response: request.Response = await request
        .agent(app)
        .get('/invoice')
        .set('Authorization', `LSAT ${macaroon}:`)
      expect(response.status).to.equal(404)
      expect(response).to.have.nested.property('body.error.message')

      // expect some kind of message that tells us the invoice is missing
      expect(response.body.error.message).to.match(/invoice/g)
    })

    it('should return return invoice information w/ status for request w/ valid LSAT macaroon', async () => {
      const response: InvoiceResponse = {
        id: invoiceResponse.id,
        payreq: invoiceResponse.request,
        createdAt: invoiceResponse.created_at,
        amount: invoiceResponse.tokens,
        secret: invoiceResponse.secret,
        status: 'paid',
        description: invoiceResponse.description,
      }

      // add extra expiration caveats. it should pass if newer is more restrictive
      builder.add_first_party_caveat(`expiration=${Date.now() + 500}`)
      const macaroon = builder.getMacaroon().serialize()

      const supertestResp: request.Response = await request
        .agent(app)
        .get('/invoice')
        .set('Authorization', `LSAT ${macaroon}:`)

      expect(supertestResp.body).to.eql(response)
    })

    it('should not return the secret if invoice is unpaid', async () => {
      const macaroon = builder.getMacaroon().serialize()
      // Setup response from getInvoice that it could not be found
      getInvStub.restore()

      // TODO: confirm the error message and code when no invoice with that id is available
      getInvStub = getLnStub('getInvoice', {
        ...invoiceResponse,
        is_confirmed: false,
      })

      const response: request.Response = await request
        .agent(app)
        .get('/invoice')
        .set('Authorization', `LSAT ${macaroon}:`)

      expect(response.body).to.not.have.property('secret')
    })
  })

  describe('POST /invoice', () => {
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
