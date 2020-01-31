import { expect } from 'chai'
import { Request } from 'express'
import sinon from 'sinon'
import { MacaroonsBuilder } from 'macaroons.js'
import { MacaroonInterface, Identifier, Lsat, Caveat } from 'lsat-js'
import { parsePaymentRequest } from 'ln-service'
import crypto from 'crypto'
import { createPrivateKey, getPublicKey } from '@lntools/crypto'
import rp from 'request-promise-native'

import { invoiceResponse } from './data'
import {
  createLsatFromInvoice,
  getOriginFromRequest,
  createInvoice,
  createChallengeCaveat,
  decodeChallengeCaveat,
  TokenChallenge,
} from '../src/helpers'
import { InvoiceResponse } from '../src/typings'
import { invoice } from './data'
import { getLnStub } from './utilities'

describe('helper functions', () => {
  describe('getOriginFromRequest', () => {
    it('should get the client ip from different request objects', () => {
      const origin = '182.39.28.11'
      const requests = [
        {
          name: 'request from proxy',
          req: { headers: { 'x-forwarded-for': origin } },
        },
        {
          name: 'request from proxy with array of ips',
          req: { headers: { 'x-forwarded-for': [origin, '127.0.0.1'] } },
        },
        {
          name: 'request with ip (express)',
          req: { ip: origin },
        },
        {
          name: 'request without express',
          req: { connection: { remoteAddress: origin } },
        },
        {
          name: 'no origin',
          shouldThrow: true,
          req: {},
        },
        {
          name: 'invalid ip',
          shouldThrow: true,
          req: { connection: { remoteAddress: `${origin}00000000` } },
        },
      ]

      for (const { req, name, shouldThrow } of requests) {
        if (shouldThrow) {
          const getOrigin = (): string =>
            getOriginFromRequest((req as unknown) as Request)
          expect(
            getOrigin,
            `Expected function to throw with ${name}`
          ).to.throw()
        } else {
          const origin = getOriginFromRequest((req as unknown) as Request)
          expect(
            origin,
            `Expected to get correct origin from ${name}`
          ).to.equal(origin)
        }
      }
    })
  })

  describe('createLsatFromInvoice', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let invoice: InvoiceResponse, request: any

    beforeEach(() => {
      invoice = {
        payreq: invoiceResponse.request,
        id: invoiceResponse.id,
        createdAt: invoiceResponse.created_at,
        amount: invoiceResponse.tokens,
      }
      request = { hostname: 'localhost', ip: '127.0.0.1' }
    })

    it('should be able to create an lsat from an invoice and location', () => {
      const lsat = createLsatFromInvoice(request as Request, invoice)
      const createLsat = (): Lsat =>
        createLsatFromInvoice(request as Request, invoice)
      const getId = (): Identifier => Identifier.fromString(lsat.id)
      const getToken = (): string => lsat.toToken()
      const getChallenge = (): string => lsat.toChallenge()

      expect(
        createLsat,
        'Should be able to create lsat from invoice'
      ).to.not.throw()
      expect(lsat, 'LSAT should have base macaroon').to.have.property(
        'baseMacaroon'
      )
      expect(
        lsat.paymentHash,
        'LSAT should have matching payment hash'
      ).to.equal(invoice.id)
      expect(
        getId,
        'Should be able to get an identifier from resulting LSAT'
      ).to.not.throw()
      expect(
        getToken,
        'Should be able to generate valid token from LSAT'
      ).to.not.throw()
      expect(
        getChallenge,
        'Should be able to generate a valid challenge from LSAT'
      ).to.not.throw()
    })

    it('should be able to add custom caveats that utilize the request object', () => {
      // test single caveat getter
      const singleCaveatGetter = (req: Request): string => {
        const ip = req.ips && req.ips.length ? req.ips[0] : req.ip
        const caveat = new Caveat({
          condition: 'ip',
          value: ip,
        })
        return caveat.encode()
      }

      // test array of caveat getters
      const secondCaveatGetter = (): string => {
        const caveat = new Caveat({
          condition: 'middleName',
          value: 'danger',
        })
        return caveat.encode()
      }
      const firstCaveat = singleCaveatGetter(request)
      const secondCaveat = secondCaveatGetter()
      const caveatGetters = [singleCaveatGetter, secondCaveatGetter]

      const requestWithArray = {
        name: 'request with array of caveat getters',
        request: {
          ...request,
          boltwallConfig: {
            getCaveats: caveatGetters,
          },
        },
      }

      const requestWithSingle = {
        name: 'request single caveat getter',
        request: {
          ...request,
          boltwallConfig: {
            getCaveats: singleCaveatGetter,
          },
        },
      }

      // for each scenario
      for (const { name, request } of [requestWithArray, requestWithSingle]) {
        // create an lsat with the given request and invoice
        const lsat = createLsatFromInvoice(request as Request, invoice)
        expect(lsat, 'LSAT should have base macaroon').to.have.property(
          'baseMacaroon'
        )

        // get the macaroon from the lsat so we can test its caveats
        const macaroon: MacaroonInterface = MacaroonsBuilder.deserialize(
          lsat.baseMacaroon
        )
        let hasFirstMacaroon = false,
          hasSecondMacaroon = false

        // for each caveat we want to see if it matches the expected caveat getters
        for (const { rawValue } of macaroon.caveatPackets) {
          if (rawValue.toString() === firstCaveat) hasFirstMacaroon = true
          else if (rawValue.toString() === secondCaveat)
            hasSecondMacaroon = true
        }

        expect(
          hasFirstMacaroon,
          `generated lsat macaroon should have had caveats from custom ${name}`
        ).to.be.true

        if (Array.isArray(request.boltwallConfig.getCaveats))
          expect(
            hasSecondMacaroon,
            `generated lsat macaroon should have had caveats from custom ${name}`
          ).to.be.true
      }
    })

    it('should generate correct macaroon when oauth is enabled in config', () => {
      request.boltwallConfig = {
        oauth: true,
      }
      request.query = { auth_uri: 'https://my-boltwall.net' }

      const lsat = createLsatFromInvoice(request as Request, invoice)
      const macaroon = MacaroonsBuilder.deserialize(lsat.baseMacaroon)
      const caveat = lsat.getCaveats().find(c => c.condition === 'challenge')
      expect(
        macaroon.location,
        'macaroon location should be set to the auth_uri'
      ).to.equal(request.query.auth_uri)
      expect(caveat, 'No challenge caveat found on lsat macaroon').to.exist
      if (caveat)
        expect(caveat.value).to.include(
          parsePaymentRequest({ request: invoiceResponse.request }).destination
        )
    })
  })

  describe('createInvoice', () => {
    interface InvoiceResponseStub {
      request: string
      is_confirmed: boolean
      id: string
      secret: string
      tokens: number
      created_at: string
      description: string
    }
    let createInvStub: sinon.SinonStub,
      invoiceResponse: InvoiceResponseStub,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      postStub: sinon.SinonStub<any>

    beforeEach(() => {
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

      createInvStub = getLnStub('createInvoice', {
        ...invoiceResponse,
        is_confirmed: false,
      })
    })
    afterEach(() => {
      createInvStub.restore()
      if (postStub) postStub.restore()
    })

    it('should create an invoice using the amount provided in a request query', async () => {
      const request = { lnd: {}, query: { amount: 50 }, body: {} }

      createInvStub
        .withArgs({
          lnd: request.lnd,
          tokens: request.query.amount,
          description: undefined,
          expires_at: undefined,
        })
        .returns({ ...invoiceResponse, tokens: request.query.amount })

      const result = await createInvoice((request as unknown) as Request)

      expect(createInvStub.called).to.be.true
      expect(result.amount).to.equal(request.query.amount)
    })

    it('should return an error if oauth is true but missing auth_uri in request', async () => {
      const request = {
        query: {},
        lnd: {},
        boltwallConfig: { oauth: true },
        body: { amount: 50 },
      }

      let thrown = false
      try {
        await createInvoice((request as unknown) as Request)
      } catch (e) {
        thrown = true
      }
      expect(thrown).to.be.true
    })

    it('should request a new invoice from auth_uri if oauth is enabled', async () => {
      const authUri = 'http://my-boltwall.com/'
      const uri = new URL('/invoice', authUri)

      const request = {
        query: {
          auth_uri: authUri,
          amount: 50,
        },
        lnd: {},
        body: {
          foo: 'bar',
        },
        boltwallConfig: {
          oauth: true,
        },
      }

      // add query items to the rp uri minus the auth_uri
      const qs = JSON.parse(
        JSON.stringify({ ...request.query, auth_uri: undefined })
      )

      const options = {
        uri: uri.href,
        qs,
        body: JSON.stringify(request.body),
      }

      postStub = sinon.stub(rp, 'post')
      postStub.withArgs(sinon.match(options)).returns(invoiceResponse)

      const invoice = await createInvoice((request as unknown) as Request)

      expect(postStub.called).to.be.true
      expect(invoice).to.equal(invoiceResponse)
    })
  })

  describe('createChallengeCaveat', () => {
    let bytes: Buffer,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bytesStub: sinon.SinonStub<Buffer[]> | sinon.SinonStub<any>
    beforeEach(() => {
      bytes = crypto.randomBytes(32)
      bytesStub = sinon.stub(crypto, 'randomBytes')
      bytesStub.returns(bytes)
    })

    afterEach(() => {
      bytesStub.restore()
    })
    it('should return a properly encoded challenge caveat', () => {
      const string = createChallengeCaveat(invoice.payreq)
      const getCaveat = (): Caveat => Caveat.decode(string)
      expect(getCaveat).to.not.throw()

      const caveat = getCaveat()
      expect(caveat.condition).to.equal('challenge')

      const requestDetails = parsePaymentRequest({ request: invoice.payreq })
      const expectedValue = `${bytes.toString('hex')}:${
        requestDetails.destination
      }:`
      expect(caveat.value).to.equal(expectedValue)
    })
  })

  describe('decodeChallengeCaveat', () => {
    it('should correctly decode challenge caveat', () => {
      const pk = createPrivateKey()
      const pubkey = getPublicKey(pk)
      const challenge = crypto.randomBytes(32).toString('hex')
      const signature = crypto.randomBytes(32).toString('hex')

      let caveat = `challenge=${challenge}:${pubkey.toString('hex')}:`

      let decoded = decodeChallengeCaveat(caveat)
      expect(decoded.pubkey).to.equal(pubkey.toString('hex'))
      expect(decoded.challenge).to.equal(challenge)

      caveat += signature
      decoded = decodeChallengeCaveat(caveat)
      expect(decoded.signature).to.equal(signature)

      const malformed = [
        `chall=${challenge}:${pubkey.toString('hex')}:`,
        `challenge=12345:${pubkey.toString('hex')}:`,
        `challenge=${challenge}:12345:`,
      ]
      for (const c of malformed) {
        const decode = (): TokenChallenge => decodeChallengeCaveat(c)
        expect(decode).to.throw()
      }
    })
  })
})
