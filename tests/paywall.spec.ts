import * as request from 'supertest'
import { expect } from 'chai'
import { Application, Request } from 'express'

import { invoiceResponse } from './data'
import {
  getLnStub,
  getTestBuilder,
  BuilderInterface,
  getExpirationCaveat,
  setSessionSecret,
} from './utilities'
import getApp, { protectedRoute } from './mockApp'
import { Caveat, Lsat } from '../src/lsat'
import { BoltwallConfig } from '../src/typings'

describe('paywall', () => {
  let lndGrpcStub: sinon.SinonStub,
    createInvStub: sinon.SinonStub,
    getInvStub: sinon.SinonStub,
    sessionSecret: string,
    builder: BuilderInterface,
    app: Application

  beforeEach(() => {
    sessionSecret = setSessionSecret()
    createInvStub = getLnStub('createInvoice', invoiceResponse)
    getInvStub = getLnStub('getInvoice', invoiceResponse)
    // boltwall sets up authenticated client when it boots up
    // need to stub this to avoid connection errors and speed up tests
    lndGrpcStub = getLnStub('authenticatedLndGrpc', { lnd: {} })
    builder = getTestBuilder(sessionSecret)
    app = getApp()
  })

  afterEach(() => {
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

  it('should support custom caveats and caveat satisfiers', async () => {
    // can't mock a different origin IP address which would be most practical
    // so we'll test that a property in the body matches from the time of the
    // original request and a subsequent paid for request. This will verify that
    // we can validate caveats that are entirely reliant on the initial and
    // subsequent requests
    const options: BoltwallConfig = {
      getCaveats: req =>
        `middlename=${req.body?.middlename}`,
      caveatSatisfiers: {
        condition: 'middlename',
        satisfyFinal: (caveat: Caveat, req: Request): boolean => {
          const middlename = req.body?.middlename
          if (caveat.value === middlename) return true
          return false
        },
      },
    }
    // get an express App with our custom options
    const middlename = 'danger'
    app = getApp(options)
    let resp = await request
      .agent(app)
      .get(protectedRoute)
      .send({ middlename })
      .expect(402)

    const lsat = Lsat.fromChallenge(resp.header['www-authenticate'])

    // make a valid lsat with secret
    lsat.setPreimage(invoiceResponse.secret)

    // make a request with the wrong body parameter
    // which should fail authorization (because macaroon won't validate)
    resp = await request
      .agent(app)
      .get(protectedRoute)
      .set('Authorization', lsat.toToken())
      .send({ middlename: 'scott' })
      .expect(401)

    // make a request with a valid request body
    resp = await request
      .agent(app)
      .get(protectedRoute)
      .set('Authorization', lsat.toToken())
      .send({ middlename })
      .expect(200)
  })
})
