import * as request from 'supertest'
import { expect } from 'chai'

import { invoiceResponse } from './data'
import {
  getEnvStub,
  getLnStub,
  getTestBuilder,
  BuilderInterface,
  getExpirationCaveat,
} from './utilities'
import app, { protectedRoute } from '../src/app'
import { Lsat } from '../src/lsat'

describe('paywall', () => {
  let envStub: sinon.SinonStub,
    lndGrpcStub: sinon.SinonStub,
    createInvStub: sinon.SinonStub,
    getInvStub: sinon.SinonStub,
    sessionSecret: string,
    builder: BuilderInterface

  beforeEach(() => {
    sessionSecret = 'my super secret'
    envStub = getEnvStub(sessionSecret)
    createInvStub = getLnStub('createInvoice', invoiceResponse)
    getInvStub = getLnStub('getInvoice', invoiceResponse)
    // boltwall sets up authenticated client when it boots up
    // need to stub this to avoid connection errors and speed up tests
    lndGrpcStub = getLnStub('authenticatedLndGrpc', { lnd: {} })
    builder = getTestBuilder(sessionSecret)
  })

  afterEach(() => {
    envStub.restore()
    lndGrpcStub.restore()
    createInvStub.restore()
    getInvStub.restore()
  })

  it('should return 402 with LSAT WWW-Authenticate header if no LSAT present', async () => {
    const resp: request.Response = await request
      .agent(app)
      .get(protectedRoute)
      .expect(402)
      .expect('WWW-Authenticate', /LSAT/i)

    const header = resp.header['www-authenticate']
    const getLsat = (): Lsat => Lsat.fromHeader(header)

    expect(getLsat, 'Should return a valid LSAT header').to.not.throw()
    const lsat = getLsat()
    expect(lsat.paymentHash).to.equal(
      invoiceResponse.id,
      'Expected to get lsat with payment hash to match invoice'
    )
  })

  it('should return 402 if request has LSAT with a macaroon but no secret', async () => {
    const macaroon = builder.getMacaroon().serialize()

    const resp: request.Response = await request
      .agent(app)
      .get(protectedRoute)
      .set('Authorization', `LSAT ${macaroon}:`)
      .expect(402)

    const lsat = Lsat.fromChallenge(resp.header['www-authenticate'])
    expect(lsat.baseMacaroon).to.include(
      macaroon,
      'Expected response to include the macaroon sent in Authorization header'
    )
  })

  it('should return 401 with expiration message if macaroon is expired', async () => {
    const expirationCaveat = getExpirationCaveat(-100)

    const macaroon = builder
      .add_first_party_caveat(expirationCaveat.encode())
      .getMacaroon()
      .serialize()

    const response: request.Response = await request
      .agent(app)
      .get(protectedRoute)
      .set('Authorization', `LSAT ${macaroon}:`)

    expect(response.status).to.equal(401)
    expect(response).to.have.nested.property('body.error.message')
    // confirm it gives an error message about an expired macaroon
    expect(response.body.error.message).to.match(/expired/g)
  })

  it('should return 401 for invalid macaroon', async () => {
    const macaroon = getTestBuilder('another secret')
      .getMacaroon()
      .serialize()

    const response: request.Response = await request
      .agent(app)
      .get(protectedRoute)
      .set('Authorization', `LSAT ${macaroon}:`)

    expect(response.status).to.equal(401)
    expect(response).to.have.nested.property('body.error.message')
  })

  it('should return 400 response if LSAT has an invalid secret', async () => {
    const macaroon = builder.getMacaroon().serialize()

    const response: request.Response = await request
      .agent(app)
      .get(protectedRoute)
      .set('Authorization', `LSAT ${macaroon}:12345`)
      .expect(400)

    expect(response).to.have.nested.property('body.error.message')
    expect(
      response.body.error.message,
      'Expected error message to mention invalid secret or preimage'
    ).to.include('Bad Request')
  })

  it('should return 200 response for request with valid LSAT', async () => {
    const macaroon = builder.getMacaroon().serialize()
    const lsat = Lsat.fromMacaroon(macaroon, invoiceResponse.request)
    lsat.setPreimage(invoiceResponse.secret)

    await request
      .agent(app)
      .get(protectedRoute)
      .set('Authorization', lsat.toToken())
      .expect(200)
  })
})
