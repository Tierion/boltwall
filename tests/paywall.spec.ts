import * as request from 'supertest'
import { expect } from 'chai'
import sinon from 'sinon'
import { Application, Request } from 'express'
import { Caveat, Lsat } from 'lsat-js'

import { invoiceResponse, secondInvoice } from './data'
import {
  getLnStub,
  getTestBuilder,
  BuilderInterface,
  getExpirationCaveat,
  setSessionSecret,
} from './utilities'
import getApp, { protectedRoute } from './mockApp'
import { BoltwallConfig, InvoiceResponse } from '../src/typings'
import * as helpers from '../src/helpers'

describe('paywall', () => {
  let lndGrpcStub: sinon.SinonStub,
    createInvStub: sinon.SinonStub,
    getInvStub: sinon.SinonStub,
    sessionSecret: string,
    builder: BuilderInterface,
    app: Application,
    lsat: Lsat,
    macaroon: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    checkInvoiceStub: sinon.SinonStub<any>

  beforeEach(() => {
    sessionSecret = setSessionSecret()
    createInvStub = getLnStub('createInvoice', invoiceResponse)
    getInvStub = getLnStub('getInvoice', invoiceResponse)
    // boltwall sets up authenticated client when it boots up
    // need to stub this to avoid connection errors and speed up tests
    lndGrpcStub = getLnStub('authenticatedLndGrpc', { lnd: {} })
    builder = getTestBuilder(sessionSecret)
    app = getApp()
    macaroon = builder.getMacaroon().serialize()
    lsat = Lsat.fromMacaroon(macaroon, invoiceResponse.request)
  })

  afterEach(() => {
    lndGrpcStub.restore()
    createInvStub.restore()
    getInvStub.restore()
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
})
