import * as sinon from 'sinon'
import lnService from 'ln-service'
import { MacaroonsBuilder } from 'macaroons.js'
import { randomBytes } from 'crypto'

import { invoice } from './data'
import { Identifier } from '../src/lsat'

class MacaroonsBuilderInterface extends MacaroonsBuilder {}

// getStub is a utility for generating a sinon stub for an lnService method
export function getLnStub(
  method: string,
  returnValue?: object | string
): sinon.SinonStub {
  if (returnValue) {
    const stub: sinon.SinonStub = sinon.stub(lnService, method)
    stub.returns(returnValue)
    return stub
  }
  return sinon.stub(lnService, method)
}

export function getTestBuilder(secret = 'secret'): MacaroonsBuilderInterface {
  const request = lnService.parsePaymentRequest({ request: invoice.payreq })

  const identifier = new Identifier({
    paymentHash: Buffer.from(request.id, 'hex'),
    tokenId: randomBytes(32),
  })
  return new MacaroonsBuilder('location', secret, identifier.toString())
}
