import * as sinon from 'sinon'
import lnService from 'ln-service'
import { MacaroonsBuilder } from 'macaroons.js'
import { randomBytes } from 'crypto'

import * as helpers from '../src/helpers'
import { invoice } from './data'
import { Identifier, Caveat } from '../src/lsat'

export class BuilderInterface extends MacaroonsBuilder {}

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

export function getEnvStub(sessionSecret = 'my super secret'): sinon.SinonStub {
  return sinon
    .stub(helpers, 'getEnvVars')
    .returns({ SESSION_SECRET: sessionSecret })
}

export const getExpirationCaveat = (time = 1000): Caveat =>
  new Caveat({ condition: 'expiration', value: Date.now() + time })

export function getTestBuilder(secret: string): BuilderInterface {
  const request = lnService.parsePaymentRequest({ request: invoice.payreq })

  const identifier = new Identifier({
    paymentHash: Buffer.from(request.id, 'hex'),
    tokenId: randomBytes(32),
  })
  const builder = new MacaroonsBuilder(
    'location',
    secret,
    identifier.toString()
  )
  const caveat = getExpirationCaveat()
  return builder.add_first_party_caveat(caveat.encode())
}
