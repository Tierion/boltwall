import { expect } from 'chai'
import { Request } from 'express'

import { TIME_CAVEAT_CONFIGS, ORIGIN_CAVEAT_CONFIGS, ROUTE_CAVEAT_CONFIGS } from '../src/configs'
import { BoltwallConfig, InvoiceResponse, CaveatGetter } from '../src/typings'
import { Satisfier, Caveat, verifyCaveats } from 'lsat-js'

describe('configs', () => {
  describe('TIME_CAVEAT_CONFIGS', () => {
    let config: BoltwallConfig, satisfier: Satisfier, rate: number
    beforeEach(() => {
      config = TIME_CAVEAT_CONFIGS
      if (!config.caveatSatisfiers)
        throw new Error('Missing caveat satisfiers on time config')
      satisfier = Array.isArray(config.caveatSatisfiers)
        ? config.caveatSatisfiers[0]
        : config.caveatSatisfiers
      // sats per second
      rate = 10
    })

    it('should create valid caveat that expires after x seconds, where "x" is number satoshis paid', () => {
      if (!config.getCaveats)
        throw new Error('Expected to have a getCaveats property')

      const now = Date.now()

      // make typescript happy since this could be an array
      const getCaveats = Array.isArray(config.getCaveats)
        ? config.getCaveats[0]
        : config.getCaveats

      const amount = 999

      const result: string = getCaveats(
        { boltwallConfig: { ...config, rate } } as Request, // not used in this getter
        { amount } as InvoiceResponse
      )

      // time is in milliseconds, so need to convert amount paid
      // from satoshis (should be number of seconds) to milliseconds divided by rate
      const expectedTime = now + (amount * 1000) / rate

      const convertCaveat = (): Caveat => Caveat.decode(result)
      const caveat = Caveat.decode(result)
      const value: number = +caveat.value
      expect(convertCaveat).to.not.throw()
      expect(value).to.be.greaterThan(now)
      // increasing the range just to account for a buffer
      expect(value).to.be.lessThan(expectedTime + 350)
    })

    it('should support custom rates for adding expiration caveat', () => {
      if (!config.getCaveats)
        throw new Error('Expected to have a getCaveats property')
      // rate is calculated as number of seconds per satoshi
      // testing a value that would give us 1 month for 20k sats
      const seconds = 60 * 60 * 24 * 30 // 1 month
      const sats = 20000 // 20k sats
      const rate = (sats / seconds).toFixed(5)
      const req = {
        boltwallConfig: {
          rate,
        },
      }
      const now = Date.now()

      // make typescript happy since this could be an array
      const getCaveats = Array.isArray(config.getCaveats)
        ? config.getCaveats[0]
        : config.getCaveats

      const result: string = getCaveats(
        (req as unknown) as Request,
        {
          amount: sats,
        } as InvoiceResponse
      )
      const convertCaveat = (): Caveat => Caveat.decode(result)
      const caveat = Caveat.decode(result)
      const value: number = +caveat.value

      // convert difference from ms
      const actualSeconds = (value - now) / 1000

      expect(convertCaveat).to.not.throw()
      expect(value).to.be.greaterThan(now)
      expect(actualSeconds).to.be.approximately(
        seconds,
        2500,
        `Expected expiration to be approximately ${seconds}ms from now`
      )
    })

    it('should return the expected invoice description', () => {
      const { getInvoiceDescription } = config

      if (!getInvoiceDescription)
        throw new Error('expected to have invoice description getter')

      const reqBase = { method: 'GET', originalUrl: '/test', ip: '127.0.0.1' }
      const time = 999
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
      const expectValid = satisfier.satisfyFinal(validCaveat, {} as Request)
      const expired = new Caveat({
        condition: 'expiration',
        value: Date.now() - 100,
      })
      const expectFailed = satisfier.satisfyFinal(expired, {} as Request)

      expect(validCaveat.condition).to.equal(satisfier.condition)
      expect(expectValid, 'Valid caveat should have been satisfied').to.be.true
      expect(expired.condition).to.equal(satisfier.condition)
      expect(expectFailed, 'expired caveat should be invalid').to.be.false
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
      const expectValid = verifyCaveats([firstCaveat, secondCaveat], satisfier)
      const expectFailed = verifyCaveats([secondCaveat, firstCaveat], satisfier)

      expect(satisfier).to.have.property('satisfyPrevious')
      expect(
        expectValid,
        'Expected caveats w/ increasing restrictiveness to pass'
      ).to.be.true
      expect(
        expectFailed,
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
        const decoded = Caveat.decode(caveat)
        const isValid = satisfier.satisfyFinal(decoded, req)

        expect(
          caveat,
          `Expected ${name} request to generate expected caveat`
        ).to.equal(expected.encode())
        expect(satisfier.condition).to.equal(decoded.condition)
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

  describe('ROUTE_CAVEAT_CONFIGS', () => {
    let config: BoltwallConfig,
      satisfier: Satisfier,
      getCaveats: CaveatGetter,
      condition: string

    beforeEach(() => {
      config = {...ROUTE_CAVEAT_CONFIGS, masterRoute: "/master"}
      condition = 'route'

      if (!config.caveatSatisfiers)
        throw new Error('Missing caveat satisfiers on route config')

      if (!config.getCaveats)
        throw new Error('Missing caveat getter from route config')

      satisfier = Array.isArray(config.caveatSatisfiers)
        ? config.caveatSatisfiers[0]
        : config.caveatSatisfiers

      getCaveats = Array.isArray(config.getCaveats)
        ? config.getCaveats[0]
        : config.getCaveats
    })

    it('should create an invoice description with the route you are requesting access to', () => {
      const request = { path: '/path' }
      const expected = 'Request made for authorization restricted to /path route'

      const description = config.getInvoiceDescription ? config.getInvoiceDescription(request as Request) : null
      expect(description).to.equal(expected)
    })

    it('should create a caveat that restricts access by route and be able to satisfy it', () => {
      const path = '/test'
      const expected = new Caveat({ condition, value: path })

      const request = { path }

      const caveat = getCaveats(
        (request as unknown) as Request,
        {} as InvoiceResponse
      )
      const decoded = Caveat.decode(caveat)
      const isValid = satisfier.satisfyFinal(expected, request)

      expect(
        caveat,
        `Request to generate expected caveat`
      ).to.equal(expected.encode())
      expect(satisfier.condition).to.equal(decoded.condition)
      expect(isValid).to.be.true
      
    })

    it('should create a caveat that restricts access by route and fail to satisfy it', () => {
      const expected = new Caveat({ condition, value: '/path' })
      const request = { path: '/failTest' }

      const actual = getCaveats(
        (request as unknown) as Request,
        {} as InvoiceResponse
      )
      const decodedActual = Caveat.decode(actual)
      const isValid = satisfier.satisfyFinal(expected, request)

      expect(
        actual,
        `Request to NOT generate expected caveat`
      ).to.not.be.equal(expected.encode())
      expect(satisfier.condition).to.equal(decodedActual.condition)
      expect(decodedActual.condition).to.equal(expected.condition)
      expect(decodedActual.value).to.not.equal(expected.value)
      expect(isValid).to.be.false
    })

    it('should create a caveat that restricts access by route and satify it from master path', () => {
      const expected = new Caveat({ condition, value: '/master' })
      const request = { path: '/someOtherPath', boltwallConfig: { masterRoute: '/master' } }

      const actual = getCaveats(
        (request as unknown) as Request,
        {} as InvoiceResponse
      )
      const decodedActual = Caveat.decode(actual)
      const isValid = satisfier.satisfyFinal(expected, request)

      expect(
        actual,
        `Expected request NOT to generate expected caveat`
      ).to.not.be.equal(expected.encode())
      expect(satisfier.condition).to.equal(decodedActual.condition)
      expect(decodedActual.condition).to.equal(expected.condition)
      expect(decodedActual.value).to.not.equal(expected.value)
      // still valid because caveat from master route
      expect(isValid).to.be.true
    })

    it('should create a caveat that restricts access by route and satified with a subroute when subroutes allowed', () => {
      const expected = new Caveat({ condition, value: '/route' })
      const request = { path: '/route/subroute', boltwallConfig: { allowSubroutes: true } }

      const actual = getCaveats(
        (request as unknown) as Request,
        {} as InvoiceResponse
      )
      const decodedActual = Caveat.decode(actual)
      const isValid = satisfier.satisfyFinal(expected, request)

      expect(
        actual,
        `Expected request NOT to generate expected caveat`
      ).to.not.be.equal(expected.encode())
      expect(satisfier.condition).to.equal(decodedActual.condition)
      expect(decodedActual.condition).to.equal(expected.condition)
      expect(decodedActual.value).to.not.equal(expected.value)
      expect(isValid).to.be.true
    })

    it('should create a caveat that restricts access by route and NOT satified with a subroute when subroutes NOT allowed', () => {
      const expected = new Caveat({ condition, value: '/route' })
      const request = { path: '/route/subroute', boltwallConfig: { allowSubroutes: false } }

      const actual = getCaveats(
        (request as unknown) as Request,
        {} as InvoiceResponse
      )
      const decodedActual = Caveat.decode(actual)
      const isValid = satisfier.satisfyFinal(expected, request)

      expect(
        actual,
        `Expected request NOT to generate expected caveat`
      ).to.not.be.equal(expected.encode())
      expect(satisfier.condition).to.equal(decodedActual.condition)
      expect(decodedActual.condition).to.equal(expected.condition)
      expect(decodedActual.value).to.not.equal(expected.value)
      expect(isValid).to.be.false
    })
  })
})
