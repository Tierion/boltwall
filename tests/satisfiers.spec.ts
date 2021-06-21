import { expect } from 'chai'
import { Caveat } from 'lsat-js'
import { challenge as challengeData } from './fixtures'
import { challengeSatisfier } from '../src/satisfiers'

describe('satisfiers', () => {
  let pubkey: string,
    challenge: string,
    signature: string,
    curr: Caveat,
    prev: Caveat

  before(() => {
    signature = challengeData.signature
    challenge = challengeData.challenge
    pubkey = challengeData.pubkey
    prev = new Caveat({
      condition: 'challenge',
      value: `${challenge}:${pubkey}:`,
    })

    curr = new Caveat({
      condition: 'challenge',
      value: prev.value.toString() + signature,
    })
  })

  describe('challengeSatisifer', () => {
    it('should have the right condition "challenge"', () => {
      expect(challengeSatisfier.condition).to.equal('challenge')
    })
    describe('satisfyPrevious', () => {
      it('should pass if both have same challenge and pubkey', () => {
        const isValid = challengeSatisfier.satisfyPrevious
          ? challengeSatisfier.satisfyPrevious(prev, curr)
          : false

        expect(isValid).to.be.true
      })

      it('should fail if there are mismatches', () => {
        const invalid = [
          {
            name: 'pubkey mismatch',
            prev: new Caveat({
              condition: 'challenge',
              value: `${challenge}:${Buffer.alloc(33).toString('hex')}:`,
            }),
            curr,
          },
          {
            name: 'challenge mismatch',
            prev: new Caveat({
              condition: 'challenge',
              value: `${Buffer.alloc(32).toString('hex')}:${pubkey}:`,
            }),
            curr,
          },
        ]

        for (const test of invalid) {
          const expectInvalid = challengeSatisfier.satisfyPrevious
            ? challengeSatisfier.satisfyPrevious(test.prev, test.curr)
            : false

          expect(expectInvalid, `Expected ${test.name} to return invalid`).to.be
            .false
        }
      })

      it('should fail if prev and current have same pubkey and current doesnt have signature', () => {
        const badCurr = new Caveat({
          condition: 'challenge',
          value: prev.value.toString(),
        })

        const isValid = challengeSatisfier.satisfyPrevious
          ? challengeSatisfier.satisfyPrevious(prev, badCurr)
          : false

        expect(isValid).to.be.false
      })
    })

    describe('satisfyFinal', () => {
      it('should pass if no signature present', () => {
        const isValid = challengeSatisfier.satisfyFinal(prev)
        expect(isValid).to.be.true
      })

      it('should pass if final caveat has proper signature', () => {
        const isValid = challengeSatisfier.satisfyFinal(curr)
        expect(
          isValid,
          'Satisfier should pass if final caveat has proper signature'
        ).to.be.true
      })

      it('should fail if caveat has invalid signature', () => {
        const invalidSig = new Caveat({
          condition: 'challenge',
          value: `${prev.value}${Buffer.alloc(64).toString('hex')}`,
        })

        // second run should fail if the signature is invalid
        const isValid = challengeSatisfier.satisfyFinal(invalidSig)
        expect(
          isValid,
          'Satisfier should fail if final caveat has invalid signature'
        ).to.be.false
      })
    })
  })
})
