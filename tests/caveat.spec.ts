import { expect } from 'chai'

import { Caveat, ErrInvalidCaveat } from '../src/lsat'

describe.only('LSAT Caveats', () => {
  describe('Caveats', () => {
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

    it('should throw if given an incorrectly encoded caveat', () => {
      const caveats = ['expiration:1337']

      caveats.forEach((c: string) => {
        const testCaveat = (): Caveat => Caveat.decode(c)
        expect(testCaveat).to.throw(ErrInvalidCaveat)
      })
    })
  })

  describe('hasCaveats', () => {
    it(
      'should return the value for the last instance of a caveat with given condition on a macaroon'
    )
  })

  describe('verifyCaveats', () => {
    it('should verify a set of caveats given a matching set of satisfiers')
  })
})
