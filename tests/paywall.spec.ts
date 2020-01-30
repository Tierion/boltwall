import * as request from 'supertest'
import { expect } from 'chai'
import sinon from 'sinon'
import { Application, Request } from 'express'
import { Caveat, Lsat } from 'lsat-js'
import { invoiceResponse, secondInvoice, challenge } from './data'
import {
  getLnStub,
  getTestBuilder,
  BuilderInterface,
  getExpirationCaveat,
  setSessionSecret,
  getEnvStub
} from './utilities'
import getApp, { protectedRoute } from './mockApp'
import { BoltwallConfig, InvoiceResponse } from '../src/typings'
import * as helpers from '../src/helpers'
import { challengeSatisfier } from '../src/satisfiers'

describe.only('paywall', () => {
  let lndGrpcStub: sinon.SinonStub,
    createInvStub: sinon.SinonStub,
    getInvStub: sinon.SinonStub,
    envStub: sinon.SinonStub,
    sessionSecret: string,
    builder: BuilderInterface,
    app: Application,
    lsat: Lsat,
    macaroon: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    checkInvoiceStub: sinon.SinonStub<any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    challengeSatisfierStub: sinon.SinonStub<any>

  beforeEach(() => {
    sessionSecret = setSessionSecret()
    createInvStub = getLnStub('createInvoice', invoiceResponse)
    getInvStub = getLnStub('getInvoice', invoiceResponse)
    // boltwall sets up authenticated client when it boots up
    // need to stub this to avoid connection errors and speed up tests
    lndGrpcStub = getLnStub('authenticatedLndGrpc', { lnd: {} })
    builder = getTestBuilder(sessionSecret)
    envStub = getEnvStub(sessionSecret)
    app = getApp()
    macaroon = builder.getMacaroon().serialize()
    lsat = Lsat.fromMacaroon(macaroon, invoiceResponse.request)
    challengeSatisfierStub = sinon.stub(challengeSatisfier, 'satisfyFinal').callThrough()
  })

  afterEach(() => {
    lndGrpcStub.restore()
    createInvStub.restore()
    getInvStub.restore()
    envStub.restore()
    challengeSatisfierStub.restore()
    if (checkInvoiceStub)
      checkInvoiceStub.restore()
  })

  it('should return 402 with WWW-Authenticate LSAT header if no LSAT present', async () => {
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
    const resp: request.Response = await request
      .agent(app)
      .get(protectedRoute)
      .set('Authorization', lsat.toToken())
      .expect(402)

    const lsatFromChallenge = Lsat.fromChallenge(resp.header['www-authenticate'])
    expect(lsatFromChallenge.baseMacaroon).to.include(
      macaroon,
      'Expected response to include the macaroon sent in Authorization header'
    )
  })

  it('should return 401 with expiration message if macaroon is expired', async () => {
    const expirationCaveat = getExpirationCaveat(-100)

    macaroon = builder
      .add_first_party_caveat(expirationCaveat.encode())
      .getMacaroon()
      .serialize()

    lsat = Lsat.fromMacaroon(macaroon, invoiceResponse.request)
  
    const response: request.Response = await request
      .agent(app)
      .get(protectedRoute)
      .set('Authorization', lsat.toToken())

    expect(response.status).to.equal(401)
    expect(response).to.have.nested.property('body.error.message')
    // confirm it gives an error message about an expired macaroon
    expect(response.body.error.message).to.match(/expired/g)
  })

  it('should return 401 for invalid macaroon', async () => {
    macaroon = getTestBuilder('another secret')
      .getMacaroon()
      .serialize()
    lsat = Lsat.fromMacaroon(macaroon, invoiceResponse.request)
    
    const response: request.Response = await request
      .agent(app)
      .get(protectedRoute)
      .set('Authorization', lsat.toToken())

    expect(response.status).to.equal(401)
    expect(response).to.have.nested.property('body.error.message')
  })

  it('should return 400 response if LSAT has an invalid secret', async () => {
    const response: request.Response = await request
      .agent(app)
      .get(protectedRoute)
      .set('Authorization', `${lsat.toToken()}12345`)
      .expect(400)

    expect(response).to.have.nested.property('body.error.message')
    expect(
      response.body.error.message,
      'Expected error message to mention invalid secret or preimage'
    ).to.include('Bad Request')
  })

  it('should return 200 response for request with valid LSAT', async () => {
    lsat.setPreimage(invoiceResponse.secret)
    await request
      .agent(app)
      .get(protectedRoute)
      .set('Authorization', lsat.toToken())
      .expect(200)
  })


  it('should check all built-in satisfiers by default', async () => {
    // test time configs
    const failedTimeCaveat = new Caveat({ condition: 'expiration', value: Date.now() - 1000 })
    const validTimeCaveat = new Caveat({ condition: 'expiration', value: Date.now() + 10000 })
    const secret = process.env.SESSION_SECRET || 'secret'
    const failedTimeMacaroon = getTestBuilder(secret).add_first_party_caveat(failedTimeCaveat.encode()).getMacaroon()
    const validTimeMacaroon = getTestBuilder(secret).add_first_party_caveat(validTimeCaveat.encode()).getMacaroon()

    // test origin configs
    const failedOriginCaveat = new Caveat({ condition: 'ip', value: '1.2.3.4' })
    const validOriginCaveat = new Caveat({ condition: 'ip', value: '::ffff:127.0.0.1' })
    const failedOriginMacaroon = getTestBuilder(secret).add_first_party_caveat(failedOriginCaveat.encode()).getMacaroon()
    const validOriginMacaroon = getTestBuilder(secret).add_first_party_caveat(validOriginCaveat.encode()).getMacaroon()
  
    const invalidChallengeCaveat = new Caveat({ condition: 'challenge', value: `${Buffer.alloc(32).toString('hex')}:${Buffer.alloc(33).toString('hex')}:`})
    const invalidChallengeMacaroon = getTestBuilder(secret).add_first_party_caveat(invalidChallengeCaveat.encode()).getMacaroon()
    const validChallengeCaveat1 = new Caveat({ condition: 'challenge', value: `${challenge.challenge}:${challenge.pubkey}:`})
    const validChallengeCaveat2 = new Caveat({ condition: 'challenge', value: `${challenge.challenge}:${challenge.pubkey}:${challenge.signature}`})
    const validChallengeMacaroon = getTestBuilder(secret).add_first_party_caveat(validChallengeCaveat1.encode()).add_first_party_caveat(validChallengeCaveat2.encode()).getMacaroon()
    
    const tests = [
      {
        name: 'expired time',
        macaroon: failedTimeMacaroon,
        expectation: 401
      },
      {
        name: 'valid time',
        macaroon: validTimeMacaroon,
        expectation: 200
      },
      {
        name: 'invalid origin',
        macaroon: failedOriginMacaroon,
        expectation: 401
      },
      {
        name: 'valid origin',
        macaroon: validOriginMacaroon,
        expectation: 200
      },
      {
        name: 'invalid challenge',
        macaroon: invalidChallengeMacaroon,
        expectation: 401
      },
      {
        name: 'valid challenge',
        macaroon: validChallengeMacaroon,
        expectation: 200
      },
    ]
    
    // want to test that challengeSatisfier is run too
    app = getApp({ oauth: true })

    for (const test of tests) {
      const lsat = Lsat.fromMacaroon(test.macaroon.serialize(), invoiceResponse.request)
      lsat.setPreimage(invoiceResponse.secret)

      const resp: request.Response = await request
      .agent(app)
      .get(protectedRoute)
      .set('Authorization', `${lsat.toToken()}`)
      
      expect(resp.status, `Unexpected status code ${resp.status} returned for ${test.name}.`).to.equal(test.expectation)
    }
    expect(challengeSatisfierStub.called).to.be.true
  })

  it('should support custom caveats and caveat satisfiers', async () => {
    // To test that we can have caveats and satisfiers that are dependent
    // on the request object, we're going to create a caveat that requires
    // a value be sent in the request body and check against that

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
    app = getApp(options)
    const middlename = 'danger'
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

  it('should return 404 if invoice on LSAT cannot be found', async () => {
    checkInvoiceStub = sinon.stub(helpers, 'checkInvoiceStatus')
    checkInvoiceStub.withArgs(secondInvoice.paymentHash).throws([503, 'UnexpectedLookupInvoiceErr'])
    const invoiceObj = {
      id: secondInvoice.paymentHash,
      payreq: secondInvoice.payreq
    }
    const lsat = helpers.createLsatFromInvoice({} as unknown as Request, invoiceObj as InvoiceResponse)
    
    await request
      .agent(app)
      .get(protectedRoute)
      .set('Authorization', lsat.toToken())
      .expect(404)
  })

  xit('should skip checkInvoice call if oauth is enabled', () => {
    app = getApp({ oauth: true })
  })

  it('should return 400 when oauth is enabled and missing auth_uri and lsat in request')
})
