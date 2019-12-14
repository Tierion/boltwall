import { randomBytes } from 'crypto'
import { expect } from 'chai'
import { MacaroonsBuilder } from 'macaroons.js'
import { parsePaymentRequest } from 'ln-service'
import { Request } from 'express'

import { invoice } from './data'

import {
  Caveat,
  ErrInvalidCaveat,
  hasCaveat,
  verifyCaveats,
  Identifier,
  LATEST_VERSION,
  TOKEN_ID_SIZE,
  ErrUnknownVersion,
  Lsat,
} from '../src/lsat'
import { Satisfier } from '../src/typings'
import { getTestBuilder } from './utilities'

describe('LSAT utils', () => {
  describe('Macaroon Identifier', () => {
    it('should properly serialize identifier of known version', () => {
      const options = {
        version: LATEST_VERSION,
        paymentHash: randomBytes(32),
        tokenId: randomBytes(TOKEN_ID_SIZE),
      }

      const identifier = new Identifier(options)
      const encodeId = (): Buffer => identifier.encode()
      expect(encodeId).to.not.throw()
      const decoded = Identifier.decode(identifier.encode())
      expect(decoded).to.deep.equal(options)
    })

    it('should fail for unknown identifier version', () => {
      const options = {
        version: LATEST_VERSION + 1,
        paymentHash: randomBytes(32),
        tokenId: randomBytes(TOKEN_ID_SIZE),
      }

      const encodeId = (): Identifier => new Identifier(options)
      expect(encodeId).to.throw(ErrUnknownVersion, options.version.toString())
    })
  })

  describe('Caveats', () => {
    describe('Caveat', () => {
      it('should be able to encode a caveat for: =, <, >', () => {
        const caveats = [
          'expiration=1337',
          'time<1337',
          'time>1337',
          'expiration=1338=',
        ]

        caveats.forEach((c: string) => {
          const testCaveat = (): Caveat => Caveat.decode(c)
          expect(testCaveat).not.to.throw()
          const caveat = Caveat.decode(c)
          expect(caveat.encode()).to.equal(c)
        })
      })

      it('should trim whitespace from caveats', () => {
        const caveats = [
          { caveat: ' expiration = 1338', expected: 'expiration=1338' },
        ]

        caveats.forEach(c => {
          const testCaveat = (): Caveat => Caveat.decode(c.caveat)
          expect(testCaveat).not.to.throw()
          const caveat = Caveat.decode(c.caveat)
          expect(caveat.encode()).to.equal(c.expected)
        })
      })

      it('should throw if given an incorrectly encoded caveat', () => {
        const caveats = ['expiration:1337']

        caveats.forEach((c: string) => {
          const testCaveat = (): Caveat => Caveat.decode(c)
          expect(testCaveat).to.throw(ErrInvalidCaveat)
        })
      })
    })

    describe('hasCaveats', () => {
      it('should return the value for the last instance of a caveat with given condition on a macaroon', () => {
        const condition = 'expiration'
        const value = 100

        const caveat = new Caveat({ condition, value })

        let builder = new MacaroonsBuilder('location', 'secret', 'pubId')
        builder = builder.add_first_party_caveat(caveat.encode())
        let macaroon = builder.getMacaroon()

        // check that it returns the value for the caveat we're checking for
        expect(hasCaveat(macaroon, caveat)).to.equal(
          caveat.value && caveat.value.toString()
        )

        // check that it will return false for a caveat that it doesn't have
        const fakeCaveat = new Caveat({ condition: 'foo', value: 'bar' })
        expect(hasCaveat(macaroon, fakeCaveat)).to.be.false

        // check that it will return the value of a newer caveat with the same condition
        const newerCaveat = new Caveat({ condition, value: value - 1 })
        builder = builder.add_first_party_caveat(newerCaveat.encode())
        macaroon = builder.getMacaroon()

        expect(hasCaveat(macaroon, newerCaveat)).to.equal(
          newerCaveat.value && newerCaveat.value.toString()
        )
      })

      it('should throw for an incorrectly encoded caveat', () => {
        const macaroon = new MacaroonsBuilder(
          'location',
          'secret',
          'pubId'
        ).getMacaroon()

        const test = (): boolean | ErrInvalidCaveat | string =>
          hasCaveat(macaroon, 'condition:fail')

        expect(test).to.throw(ErrInvalidCaveat)
      })
    })

    describe('verifyCaveats', () => {
      let caveat1: Caveat,
        caveat2: Caveat,
        caveat3: Caveat,
        caveats: Caveat[],
        satisfier: Satisfier,
        req: any

      beforeEach(() => {
        caveat1 = new Caveat({ condition: '1', value: 'test' })
        caveat2 = new Caveat({ condition: '1', value: 'test2' })
        caveat3 = new Caveat({ condition: '3', value: 'foobar' })
        caveats = [caveat1, caveat2, caveat3]

        satisfier = {
          condition: caveat1.condition,
          // dummy satisfyPrevious function to test that it tests caveat lists correctly
          satisfyPrevious: (prev, cur): boolean =>
            prev.value.toString().includes('test') &&
            cur.value.toString().includes('test'),
          satisfyFinal: (): boolean => true,
        }
        req = { boltwallConfig: { caveatSatisfiers: satisfier } }
      })

      it('should verify caveats given a set of satisfiers', () => {
        const validatesCaveats = (): boolean | Error =>
          verifyCaveats(caveats, req as Request)

        expect(validatesCaveats).to.not.throw()
        expect(validatesCaveats()).to.be.true
      })

      it('should be able to verify caveats using items on the request object')

      it('should throw when satisfiers fail', () => {
        const invalidSatisfyFinal: Satisfier = {
          ...satisfier,
          satisfyFinal: (): boolean => false,
        }
        const invalidSatisfyPrev: Satisfier = {
          ...satisfier,
          // dummy satisfyPrevious function to test that it tests caveat lists correctly
          satisfyPrevious: (prev, cur): boolean =>
            prev.value.toString().includes('test') &&
            cur.value.toString().includes('foobar'),
        }
        const invalidReq1 = {
          boltwallConfig: {
            caveatSatisfiers: [satisfier, invalidSatisfyFinal],
          },
        }
        const invalidReq2 = {
          boltwallConfig: {
            caveatSatisfiers: [satisfier, invalidSatisfyPrev],
          },
        }
        const invalidateFinal = (): boolean =>
          verifyCaveats(caveats, invalidReq1 as Request)
        const invalidatePrev = (): boolean =>
          verifyCaveats(caveats, invalidReq2 as Request)

        expect(invalidateFinal()).to.be.false
        expect(invalidatePrev()).to.be.false
      })
    })
  })

  describe('LSAT Token', () => {
    let macaroon: string,
      paymentHash: string,
      paymentPreimage: string,
      expiration: number,
      challenge: string,
      challengeWithSpace: string

    beforeEach(() => {
      expiration = Date.now() + 1000
      const caveat = new Caveat({ condition: 'expiration', value: expiration })
      const request = parsePaymentRequest({ request: invoice.payreq })

      paymentHash = request.id
      paymentPreimage = invoice.secret

      const builder = getTestBuilder('secret')
      macaroon = builder
        .add_first_party_caveat(caveat.encode())
        .getMacaroon()
        .serialize()

      challenge = `macaroon=${macaroon}, invoice=${invoice.payreq}`
      challenge = Buffer.from(challenge, 'utf8').toString('base64')
      challengeWithSpace = `macaroon=${macaroon} invoice=${invoice.payreq}`
      challengeWithSpace = Buffer.from(challengeWithSpace, 'utf8').toString(
        'base64'
      )
    })

    it('should be able to decode from challenge and from header', () => {
      const header = `LSAT ${challenge}`

      const fromChallenge = (): Lsat => Lsat.fromChallenge(challenge)
      const fromChallengeWithSpace = (): Lsat =>
        Lsat.fromChallenge(challengeWithSpace)
      const fromHeader = (): Lsat => Lsat.fromHeader(header)

      const tests = [
        {
          name: 'fromChallenge',
          test: fromChallenge,
        },
        {
          name: 'fromChallengeWithSpace',
          test: fromChallengeWithSpace,
        },
        {
          name: 'fromHeader',
          test: fromHeader,
        },
      ]
      for (const { name, test } of tests) {
        expect(test, `${name} should not have thrown`).to.not.throw()
        const lsat = test()
        expect(lsat.baseMacaroon).to.equal(
          macaroon,
          `macaroon from ${name} LSAT did not match`
        )
        expect(lsat.paymentHash).to.equal(
          paymentHash,
          `paymentHash from ${name} LSAT did not match`
        )
        expect(lsat.validUntil).to.equal(
          expiration,
          `expiration from ${name} LSAT did not match`
        )
      }

      const missingInvoice = (): Lsat =>
        Lsat.fromChallenge(`macaroon=${macaroon}`)
      const missingMacaroon = (): Lsat =>
        Lsat.fromChallenge(`invoice=${invoice}`)

      expect(
        missingInvoice,
        'Should throw when challenge is missing invoice'
      ).to.throw()
      expect(
        missingMacaroon,
        'Should throw when challenge is missing macaroon'
      ).to.throw()
    })

    it('should be able to check expiration to see if expired', () => {
      const lsat = Lsat.fromChallenge(challenge)
      expect(lsat.isExpired()).to.be.false
    })

    it('should check if payment is pending', () => {
      const lsat = Lsat.fromChallenge(challenge)

      expect(lsat).to.have.property('isPending')
      expect(lsat.isPending()).to.be.true
    })

    it('should be able to add valid preimage', () => {
      const lsat = Lsat.fromChallenge(challenge)

      const addWrongPreimage = (): void =>
        lsat.setPreimage(Buffer.alloc(32, 'a').toString('hex'))
      const addIncorrectLength = (): void => lsat.setPreimage('abcde12345')
      const addNonHex = (): void => lsat.setPreimage('xyzNMOP')
      expect(addWrongPreimage).to.throw('did not match')
      expect(addIncorrectLength).to.throw('32-byte hash')
      expect(addNonHex).to.throw('32-byte hash')

      const addSecret = (): void => lsat.setPreimage(paymentPreimage)
      expect(addSecret).to.not.throw()
      expect(lsat.paymentPreimage).to.equal(paymentPreimage)
    })

    it('should be able to return an LSAT token string', () => {
      const lsat = Lsat.fromChallenge(challenge)

      lsat.setPreimage(paymentPreimage)

      const expectedToken = `LSAT ${macaroon}:${paymentPreimage}`
      const token = lsat.toToken()

      expect(token).to.equal(expectedToken)
    })

    it('should be able to decode from token', () => {
      let token = `LSAT ${macaroon}:${paymentPreimage}`
      let lsat = Lsat.fromToken(token)
      expect(lsat.baseMacaroon).to.equal(macaroon)
      expect(lsat.paymentPreimage).to.equal(paymentPreimage)
      expect(lsat.toToken()).to.equal(token)

      // test with no secret
      token = `LSAT ${macaroon}:`
      lsat = Lsat.fromToken(token)
      expect(lsat.baseMacaroon).to.equal(macaroon)
      expect(!lsat.paymentPreimage).to.be.true
      expect(lsat.toToken()).to.equal(token)
    })
  })
})
