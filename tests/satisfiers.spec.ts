import { expect } from 'chai'
import { Caveat } from 'lsat-js'
import { challenge as challengeData } from './data'
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

    it('should satisfyPrevious if both have same challenge and pubkey', () => {
      expect(challengeSatisfier).to.have.property('satisfyPrevious')

      const isValid = challengeSatisfier.satisfyPrevious
        ? challengeSatisfier.satisfyPrevious(prev, curr)
        : false

      expect(isValid).to.be.true

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

    it('should satisfy final if the signature matches the pubkey and return false otherwise', () => {
      expect(challengeSatisfier).to.have.property('satisfyFinal')

      const { satisfyFinal } = challengeSatisfier

      // first run with a challenge without signature should pass
      let isValid = satisfyFinal(prev)
      expect(isValid, 'First run should pass even if no signature present').to
        .be.true

      isValid = satisfyFinal(curr)
      expect(
        isValid,
        'Satisfier should pass if final caveat has proper signature'
      ).to.be.true

      //run with a bad signature
      const invalidSig = new Caveat({
        condition: 'challenge',
        value: `${prev.value}${Buffer.alloc(64).toString('hex')}`,
      })

      // run once more for fake prev since odd numbered runs always pass
      satisfyFinal(prev)
      // second run should fail if the signature is invalid
      isValid = satisfyFinal(invalidSig)
      expect(
        isValid,
        'Satisfier should fail if final caveat has invalid signature'
      ).to.be.false

      // run twice both without signature to confirm failure with missing signature
      satisfyFinal(prev)
      isValid = satisfyFinal(prev)
      expect(
        isValid,
        'Satisfier should fail if final caveat does not have signature'
      ).to.be.false
    })
  })
})
