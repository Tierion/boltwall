import * as request from 'supertest'
import { expect } from 'chai'

import app, { protectedRoute } from './hodlApp'
import { invoiceResponse, InvoiceResponseStub } from './data'
import { InvoiceResponse } from '../src/typings'
import {
  getEnvStub,
  getLnStub,
  getTestBuilder,
  BuilderInterface,
} from './utilities'
import { Lsat } from '../src/lsat'

describe('hodl paywall', () => {
  let envStub: sinon.SinonStub,
    lndGrpcStub: sinon.SinonStub,
    createHodlStub: sinon.SinonStub,
    getInvStub: sinon.SinonStub,
    settleHodlStub: sinon.SinonStub,
    sessionSecret: string,
    builder: BuilderInterface,
    paymentHash: string,
    heldInvoice: InvoiceResponseStub

  beforeEach(async () => {
    heldInvoice = { ...invoiceResponse, is_held: true, is_confirmed: false }
    paymentHash = invoiceResponse.id
    sessionSecret = 'my super secret'
    envStub = getEnvStub(sessionSecret)
    createHodlStub = getLnStub('createHodlInvoice', invoiceResponse)
    getInvStub = getLnStub('getInvoice', heldInvoice)
    settleHodlStub = getLnStub('settleHodlInvoice', {})
    // boltwall sets up authenticated client when it boots up
    // need to stub this to avoid connection errors and speed up tests
    lndGrpcStub = getLnStub('authenticatedLndGrpc', { lnd: {} })
    builder = getTestBuilder(sessionSecret)
  })

  afterEach(() => {
    envStub.restore()
    lndGrpcStub.restore()
    createHodlStub.restore()
    getInvStub.restore()
    settleHodlStub.restore()
  })

  it('should return 400 bad request if hodl is enabled but no payment hash in body', async () => {
    await request
      .agent(app)
      .get(protectedRoute)
      .expect(400)
      .expect(res => {
        if (!res.error || !res.body.error.message)
          throw new Error('Expected error message')
        if (
          !/(paymentHash.*missing)|(missing.*paymentHash)/gi.test(
            res.body.error.message
          )
        )
          throw new Error(
            'Expected error message to mention missing paymentHash in request body'
          )
      })
  })

  it('should return 400 bad request if paymentHash is not a 256-bit hex string', async () => {
    await request
      .agent(app)
      .get(protectedRoute)
      .send({ paymentHash: '1235' })
      .expect(400)
      .expect(res => {
        if (!res.error || !res.body.error.message)
          throw new Error('Expected error message')
        if (!/(256.bit)/gi.test(res.body.error.message))
          throw new Error(
            'Expected error message to mention 256-bit string requirement'
          )
      })
  })

  it('should create a hodl invoice LSAT when paymentHash provided in body', async () => {
    const resp: request.Response = await request
      .agent(app)
      .get(protectedRoute)
      .send({ paymentHash: invoiceResponse.id })
      .expect(402)
      .expect('WWW-Authenticate', /LSAT/i)
    const header = resp.header['www-authenticate']
    const getLsat = (): Lsat => Lsat.fromHeader(header)

    expect(createHodlStub.called).to.be.true
    expect(getLsat, 'Should return a valid LSAT header').to.not.throw()
    const lsat = getLsat()
    expect(lsat.paymentHash).to.equal(paymentHash)
  })

  it('should check status of LSAT invoice and return 402 w/ WWW-Authenticate header if unpaid', async () => {
    getInvStub.restore()
    getInvStub = getLnStub('getInvoice', {
      ...invoiceResponse,
      is_confirmed: false,
      is_held: false,
    })

    const macaroon = builder.getMacaroon().serialize()
    const resp: request.Response = await request
      .agent(app)
      .get(protectedRoute)
      .set('Authorization', `LSAT ${macaroon}:`)
      .expect(402)

    expect(getInvStub.called, 'Expected the getInvoice method to be called').to
      .be.true

    const header = resp.header['www-authenticate']
    const getLsat = (): Lsat => Lsat.fromHeader(header)
    expect(getLsat, 'Should return a valid LSAT header').to.not.throw()
    const lsat = getLsat()
    expect(lsat.paymentHash).to.equal(paymentHash)
    expect(lsat.invoice).to.equal(invoiceResponse.request)
  })

  it('should check invoice status and allow access for an invoice that is held', async () => {
    getInvStub.restore()
    getInvStub = getLnStub('getInvoice', {
      ...invoiceResponse,
      is_confirmed: false,
      is_held: true,
    })

    const macaroon = builder.getMacaroon().serialize()
    await request
      .agent(app)
      .get(protectedRoute)
      .set('Authorization', `LSAT ${macaroon}:`)
      .expect(200)

    expect(getInvStub.called, 'Expected the getInvoice method to be called').to
      .be.true
  })

  it('should settle a held invoice when the LSAT includes the secret', async () => {
    const macaroon = builder.getMacaroon().serialize()
    const lsat = Lsat.fromMacaroon(macaroon, invoiceResponse.request)
    lsat.setPreimage(invoiceResponse.secret)

    await request
      .agent(app)
      .get(protectedRoute)
      .set('Authorization', lsat.toToken())
      .expect(200)

    expect(
      settleHodlStub.called,
      'Expected lnService call to settle invoice to be called'
    ).to.be.true
  })

  it('should block access and return 401 for a hodl invoice that is settled', async () => {
    getInvStub.restore()
    getInvStub = getLnStub('getInvoice', {
      ...invoiceResponse,
      is_confirmed: true,
      is_held: false,
    })

    const macaroon = builder.getMacaroon().serialize()
    const lsat = Lsat.fromMacaroon(macaroon, invoiceResponse.request)
    lsat.setPreimage(invoiceResponse.secret)

    await request
      .agent(app)
      .get(protectedRoute)
      .set('Authorization', lsat.toToken())
      .expect(401)
      .expect(res => {
        if (!res.error || !res.body.error.message)
          throw new Error('Expected error message')
        if (!/(expired)|(unauthorized)/gi.test(res.body.error.message))
          throw new Error('Expected error message to mention expired lsat')
      })

    expect(getInvStub.called).to.be.true
  })

  describe('GET /invoice', () => {
    it('should support getting invoice with status held', async () => {
      const response: InvoiceResponse = {
        id: invoiceResponse.id,
        payreq: invoiceResponse.request,
        createdAt: invoiceResponse.created_at,
        amount: invoiceResponse.tokens,
        status: 'held',
        description: invoiceResponse.description,
      }

      const macaroon = builder.getMacaroon().serialize()

      const supertestResp: request.Response = await request
        .agent(app)
        .get('/invoice')
        .set('Authorization', `LSAT ${macaroon}:`)

      expect(supertestResp.body).to.eql(response)
    })
  })
})
