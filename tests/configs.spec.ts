import { expect } from 'chai'
import { Request } from 'express'

import { TIME_CAVEAT_CONFIGS, ORIGIN_CAVEAT_CONFIGS } from '../src/configs'
import { BoltwallConfig, InvoiceResponse, CaveatGetter } from '../src/typings'
import { Satisfier, Caveat, verifyCaveats } from 'lsat-js'

describe('configs', () => {
  describe('TIME_CAVEAT_CONFIGS', () => {
    let config: BoltwallConfig, satisfier: Satisfier
    beforeEach(() => {
      config = TIME_CAVEAT_CONFIGS
      if (!config.caveatSatisfiers)
        throw new Error('Missing caveat satisfiers on time config')
      satisfier = Array.isArray(config.caveatSatisfiers)
        ? config.caveatSatisfiers[0]
        : config.caveatSatisfiers
    })
    it('should create valid caveat that expires after x seconds, where "x" is number satoshis paid', () => {
      if (!config.getCaveats)
        throw new Error('Expected to have a getCaveats property')

      const now = Date.now()

      // make typescript happy since this could be an array
      const getCaveats = Array.isArray(config.getCaveats)
        ? config.getCaveats[0]
        : config.getCaveats

      const amount = 1000

      const result: string = getCaveats(
        {} as Request, // not used in this getter
        { amount } as InvoiceResponse
      )

      // time is in milliseconds, so need to convert amount paid
      // from satoshis (should be number of seconds) to milliseconds
      const time = amount * 1000

      const convertCaveat = (): Caveat => Caveat.decode(result)
      expect(convertCaveat).to.not.throw()

      const caveat = Caveat.decode(result)
      const value: number = +caveat.value

      expect(value).to.be.greaterThan(now)
      // increasing the range just to account for a buffer
      expect(value).to.be.lessThan(now + time + amount)
    })

    it('should return the expected invoice description', () => {
      const { getInvoiceDescription } = config
      if (!getInvoiceDescription)
        throw new Error('expected to have invoice description getter')

      const reqBase = { method: 'GET', originalUrl: '/test', ip: '127.0.0.1' }
      const time = 1000
      const requests = [
        {
          name: 'no appName, title, or time',
          req: {
            ...reqBase,
            body: {
              amount: time,
            },
          },
          expected: `Payment to access ${reqBase.method} ${reqBase.originalUrl} for ${time} seconds`,
        },
        {
          name: 'no appName or title',
          req: {
            body: { time },
            ...reqBase,
          },
          expected: `Payment to access ${reqBase.method} ${reqBase.originalUrl} for ${time} seconds`,
        },
        {
          name: 'no appName',
          req: {
            ...reqBase,
            body: { time, title: 'test doc' },
          },
          expected: `Payment to access test doc in [unknown application @ ${reqBase.ip}] for ${time} seconds`,
        },
        {
          name: 'no title',
          req: {
            ...reqBase,
            body: { time, appName: 'my app' },
          },
          expected: `Payment to access [unknown data] in my app for ${time} seconds`,
        },
        {
          name: 'all data',
          req: {
            ...reqBase,
            body: { time, appName: 'my app', title: 'test doc' },
          },
          expected: `Payment to access test doc in my app for ${time} seconds`,
        },
      ]

      for (const { req, name, expected } of requests) {
        const description = getInvoiceDescription(req as Request)
        expect(
          description,
          `Descriptions did not match for body with ${name}`
        ).to.equal(expected)
      }
    })

    it('should have a minAmount', () => {
      expect(
        config.minAmount && config.minAmount > 0,
        'Time config should have a minimum amount greater than 0'
      ).to.be.true
    })

    it('should validate expiration caveat', () => {
      const validCaveat = new Caveat({
        condition: 'expiration',
        value: Date.now() + 1000,
      })

      expect(validCaveat.condition).to.equal(satisfier.condition)
      let isValid = satisfier.satisfyFinal(validCaveat, {} as Request)
      expect(isValid, 'Valid caveat should have been satisfied').to.be.true

      const expired = new Caveat({
        condition: 'expiration',
        value: Date.now() - 100,
      })
      expect(expired.condition).to.equal(satisfier.condition)
      isValid = satisfier.satisfyFinal(expired, {} as Request)
      expect(isValid, 'expired caveat should be invalid').to.be.false
    })

    it('should only satisfy caveats that get more restrictive', () => {
      const interval = 1000
      const condition = 'expiration'
      const firstCaveat = new Caveat({
        condition,
        value: Date.now() + interval,
      })
      const secondCaveat = new Caveat({
        condition,
        value: Date.now() + interval / 2, // more restrictive time
      })

      expect(satisfier).to.have.property('satisfyPrevious')

      let isValid = verifyCaveats([firstCaveat, secondCaveat], satisfier)

      expect(isValid, 'Expected caveats w/ increasing restrictiveness to pass')
        .to.be.true

      isValid = verifyCaveats([secondCaveat, firstCaveat], satisfier)

      expect(
        isValid,
        'Expected caveats w/ decreasingly restrictive expirations to fail'
      ).to.be.false
    })
  })
  describe('ORIGIN_CAVEAT_CONFIGS', () => {
    let config: BoltwallConfig,
      satisfier: Satisfier,
      getCaveats: CaveatGetter,
      condition: string
    beforeEach(() => {
      config = ORIGIN_CAVEAT_CONFIGS
      condition = 'ip'
      if (!config.caveatSatisfiers)
        throw new Error('Missing caveat satisfiers on origin config')

      if (!config.getCaveats)
        throw new Error('Missing caveat getter from origin config')
      satisfier = Array.isArray(config.caveatSatisfiers)
        ? config.caveatSatisfiers[0]
        : config.caveatSatisfiers

      getCaveats = Array.isArray(config.getCaveats)
        ? config.getCaveats[0]
        : config.getCaveats
    })

    it('should create a caveat that restricts access by ip and be able to satisfy it', () => {
      const origin = '180.1.23.45'
      const expected = new Caveat({ condition, value: origin })

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
      ]

      for (const { req, name } of requests) {
        const caveat = getCaveats(
          (req as unknown) as Request,
          {} as InvoiceResponse
        )
        expect(
          caveat,
          `Expected ${name} request to generate expected caveat`
        ).to.equal(expected.encode())
        const decoded = Caveat.decode(caveat)

        expect(satisfier.condition).to.equal(decoded.condition)
        const isValid = satisfier.satisfyFinal(decoded, req)
        expect(isValid).to.be.true
      }
    })

    it('should not support additional caveats from other origin', () => {
      const firstCaveat = new Caveat({ condition, value: '84.123.45.2' })
      const secondCaveat = new Caveat({ condition, value: '74.321.5.27' })
      const request = { ip: firstCaveat.value, boltwallConfig: config }
      const isValid = verifyCaveats(
        [firstCaveat, secondCaveat],
        satisfier,
        request
      )
      expect(isValid).to.be.false
    })
  })
})
