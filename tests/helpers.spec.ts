import { expect } from 'chai'

import { invoiceResponse } from './data'
import { createLsatFromInvoice } from '../src/helpers'
import { InvoiceResponse } from '../src/typings'
import { Identifier, Lsat } from '../src/lsat'

describe('helper functions', () => {
  describe('createLsatFromInvoice', () => {
    it('should be able to create an lsat from an invoice and location', () => {
      const invoice: InvoiceResponse = {
        payreq: invoiceResponse.request,
        id: invoiceResponse.id,
        createdAt: invoiceResponse.created_at,
        amount: invoiceResponse.tokens,
      }
      const location = 'localhost'
      const createLsat = (): Lsat =>
        createLsatFromInvoice({ invoice, location })

      expect(
        createLsat,
        'Should be able to create lsat from invoice'
      ).to.not.throw()

      const lsat = createLsatFromInvoice({ invoice, location })

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
  })
})
