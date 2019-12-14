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
  returnValue?: object | string,
  args?: any
): sinon.SinonStub {
  const stub: sinon.SinonStub = sinon.stub(lnService, method)
  if (args) stub.withArgs(args)
  if (returnValue) stub.returns(returnValue)
  return stub
}

// need to return any as a hack since the SinonStub type doesn't
// seem to agree with the return of this stub.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getEnvStub(sessionSecret = 'my super secret'): any {
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
