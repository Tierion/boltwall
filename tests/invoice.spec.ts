import * as request from 'supertest'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { parsePaymentRequest } from 'ln-service'
import { MacaroonsBuilder } from 'macaroons.js'

import app from '../src/app'
import { Lsat, Caveat } from '../src/lsat'
import { getLnStub } from './utilities'
import { invoice } from './data'
import * as helpers from '../src/helpers'

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

class BuilderInterface extends MacaroonsBuilder {}

const getExpirationCaveat = (): Caveat =>
  new Caveat({ condition: 'expiration', value: Date.now() - 100 })
const getInvoiceCaveat = (id: string): Caveat =>
  new Caveat({
    condition: 'invoice',
    value: id,
  })

describe.only('/invoice', () => {
  let getInvStub: sinon.SinonStub,
    createInvStub: sinon.SinonStub,
    envStub: object | sinon.SinonStub, // hack b/c getEnvVars didn't play nice with SinonStub type
    lndGrpcStub: sinon.SinonStub,
    invoiceResponse: InvoiceResponseStub,
    sessionSecret: string,
    builder: BuilderInterface

  beforeEach(() => {
    // boltwall sets up authenticated client when it boots up
    // need to stub this to avoid connection errors and speed up tests
    lndGrpcStub = getLnStub('authenticatedLndGrpc', { lnd: {} })
    // keep known session secret so we can decode macaroons
    sessionSecret = 'secret'

    envStub = sinon
      .stub(helpers, 'getEnvVars')
      .returns({ SESSION_SECRET: sessionSecret })

    const request = parsePaymentRequest({ request: invoice })

    // stubbed response for invoice related requests made through ln-service
    invoiceResponse = {
      request: invoice,
      is_confirmed: true,
      id: request.id,
      secret: Buffer.alloc(32).toString('hex'),
      tokens: 30,
      created_at: '2016-08-29T09:12:33.001Z',
      description: 'worlds best invoice',
    }

    builder = new MacaroonsBuilder('location', sessionSecret, 'identifier')

    getInvStub = getLnStub('getInvoice', invoiceResponse)
    createInvStub = getLnStub('createInvoice', {
      ...invoiceResponse,
      is_confirmed: false,
      secret: undefined,
    })
  })

  afterEach(() => {
    getInvStub.restore()
    createInvStub.restore()
    envStub.restore()
    lndGrpcStub.restore()
  })

  describe('GET /invoice', () => {
    it.only('should return 401 with www-authenticate header if no macaroon present', async () => {
      const response: request.Response = await request
        .agent(app)
        .get('/invoice')

      expect(response.status).to.equal(401)
      expect(response.header['www-authenticate']).to.exist
      if (response.header['www-authenticate']) {
        const header = response.header['www-authenticate']
        expect(header.includes('LSAT')).to.be.true
        expect(
          () => Lsat.fromHeader(header),
          'Expected to be able to create lsat token from header'
        ).to.not.throw()
        const lsat = Lsat.fromHeader(header)
        expect(lsat).to.have.property('paymentHash')
        expect(lsat).to.have.property('baseMacaroon')
        expect(lsat).to.have.property('invoice', invoice)
      }
    })

    xit('should return 401 if macaroon is expired', async () => {
      const expirationCaveat = getExpirationCaveat()
      const invCaveat = getInvoiceCaveat(invoiceResponse.id)

      const macaroon = builder
        .add_first_party_caveat(expirationCaveat.encode())
        .add_first_party_caveat(invCaveat.encode())
        .getMacaroon()
        .serialize()

      const response: request.Response = await request
        .agent(app)
        .get('/invoice')
        .set('Authorization', `LSAT ${macaroon}:`)

      expect(response.status).to.equal(401)
      expect(response).to.have.nested.property('body.error.message')
      // confirm it gives an error message about an expired macaroon
      expect(response.body.error.message).to.match(/expired/g)
    })

    xit('should return 401 if macaroon has invalid signature', async () => {
      const expirationCaveat = getExpirationCaveat()
      const invCaveat = getInvoiceCaveat(Buffer.alloc(32).toString('hex'))

      const macaroon = new MacaroonsBuilder(
        'location',
        'another secret',
        'another id'
      )
        .add_first_party_caveat(expirationCaveat.encode())
        .add_first_party_caveat(invCaveat.encode())
        .getMacaroon()
        .serialize()

      const response: request.Response = await request
        .agent(app)
        .get('/invoice')
        .set('Authorization', `LSAT ${macaroon}:`)

      expect(response.status).to.equal(401)
      expect(response).to.have.nested.property('body.error.message')
    })

    xit('should return 400 if no invoice id in the macaroon', async () => {
      const macaroon = builder.getMacaroon().serialize()
      const response: request.Response = await request
        .agent(app)
        .get('/invoice')
        .set('Authorization', `LSAT ${macaroon}:`)

      expect(response.status).to.equal(400)
      expect(response).to.have.nested.property('body.error.message')
      // confirm it gives an error message about a missing invoice
      expect(response.body.error.message).to.match(
        /missing.*invoice|invoice.*missing/g
      )
    })

    xit('should return 404 if requested invoice does not exist', async () => {
      // create a macaroon that has an invoice attached to it but our getInvoice request
      // should return a fake error that the invoice wasn't found
      const caveat = getInvoiceCaveat(invoiceResponse.id)
      const macaroon = builder
        .add_first_party_caveat(caveat.encode())
        .getMacaroon()
        .serialize()

      // Setup response from getInvoice that it could not be found
      getInvStub.restore()

      // TODO: confirm the error message and code when no invoice with that id is available
      getInvStub = getLnStub('getInvoice', [
        503,
        'UnexpectedLookupInvoiceErr',
        { err: 'no invoice with that id' },
      ])

      const response: request.Response = await request
        .agent(app)
        .get('/invoice')
        .set('Authorization', `LSAT ${macaroon}:`)
      expect(response.status).to.equal(404)
      expect(response).to.have.nested.property('body.error.message')

      // expect some kind of message that tells us the invoice is missing
      expect(response.body.error.message).to.match(/invoice.*no|no.*invoice/g)
    })

    xit('should return return invoice information w/ status for request w/ valid LSAT macaroon', async () => {
      const response: InvoiceResponse = {
        id: invoiceResponse.id,
        payreq: invoiceResponse.request,
        createdAt: invoiceResponse.created_at,
        amount: invoiceResponse.tokens,
        secret: invoiceResponse.secret,
        status: 'paid',
        description: invoiceResponse.description,
      }

      // caveat that has an invoice id to match our invoice response's payreq
      const caveat = getInvoiceCaveat(invoiceResponse.id)

      const macaroon = builder
        .add_first_party_caveat(caveat.encode())
        .getMacaroon()
        .serialize()

      const supertestResp: request.Response = await request
        .agent(app)
        .get('/invoice')
        .set('Authroization', `LSAT ${macaroon}:`)

      expect(supertestResp.body).to.equal(response)
    })
  })

  describe('POST /invoice', () => {
    it('should return a new invoice with expected description and payment amt', async () => {
      const response: InvoiceResponse = {
        id: invoiceResponse.id,
        payreq: invoiceResponse.request,
        createdAt: invoiceResponse.created_at,
        amount: invoiceResponse.tokens,
        description: invoiceResponse.description,
      }

      // TODO: Do we want to rate limit this or require a macaroon at all to avoid DDoS?
      const supertestResp: request.Response = await request
        .agent(app)
        .post('/invoice')
        .send({ amount: 100 })

      expect(supertestResp.body).to.eqls(response)
    })
  })
})
