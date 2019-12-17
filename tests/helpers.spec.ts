import { expect } from 'chai'
import { Request } from 'express'
import { MacaroonsBuilder } from 'macaroons.js'

import { MacaroonClass } from '../src/typings/lsat'
import { invoiceResponse } from './data'
import { createLsatFromInvoice, getOriginFromRequest } from '../src/helpers'
import { InvoiceResponse } from '../src/typings'
import { Identifier, Lsat, Caveat } from '../src/lsat'

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
      const createLsat = (): Lsat =>
        createLsatFromInvoice(request as Request, invoice)

      expect(
        createLsat,
        'Should be able to create lsat from invoice'
      ).to.not.throw()

      const lsat = createLsatFromInvoice(request as Request, invoice)

      const getId = (): Identifier => Identifier.fromString(lsat.id)
      const getToken = (): string => lsat.toToken()
      const getChallenge = (): string => lsat.toChallenge()

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
        const macaroon: MacaroonClass = MacaroonsBuilder.deserialize(
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
  })
})
