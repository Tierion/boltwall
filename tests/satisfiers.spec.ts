import { expect } from 'chai'
import crypto from 'crypto'
import { Caveat } from 'lsat-js'
import { createPrivateKey, getPublicKey } from '@lntools/crypto'
import secp256k1 from 'secp256k1'
import { challengeSatisfier } from '../src/satisfiers'

describe('satisfiers', () => {
  let pubkey: Buffer,
    challenge: Buffer,
    privkey: Buffer,
    signature: Buffer,
    curr: Caveat,
    prev: Caveat

  before(() => {
    privkey = createPrivateKey()
    pubkey = getPublicKey(privkey)
    challenge = crypto.randomBytes(32)
    signature = secp256k1.sign(challenge, privkey).signature

    prev = new Caveat({
      condition: 'challenge',
      value: `${challenge.toString('hex')}:${pubkey.toString('hex')}:`,
    })

    curr = new Caveat({
      condition: 'challenge',
      value: prev.value.toString() + signature.toString('hex'),
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
            value: `${challenge.toString('hex')}:${Buffer.alloc(33).toString(
              'hex'
            )}:`,
          }),
          curr,
        },
        {
          name: 'challenge mismatch',
          prev: new Caveat({
            condition: 'challenge',
            value: `${Buffer.alloc(32).toString('hex')}:${pubkey.toString(
              'hex'
            )}:`,
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

    it('should satisfy final if the signature matches the pubkey', () => {
      expect(challengeSatisfier).to.have.property('satisfyFinal')

      const { satisfyFinal } = challengeSatisfier

      let isValid = satisfyFinal(curr)
      expect(isValid).to.be.true

      isValid = satisfyFinal(prev)
      expect(
        isValid,
        'Satisfier should fail if final caveat does not have signature'
      ).to.be.false
    })
  })
})
