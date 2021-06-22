import * as sinon from 'sinon'
import lnService from 'ln-service'
import * as Macaroon from 'macaroon'
import { randomBytes } from 'crypto'

import * as helpers from '../src/helpers'
import { invoice } from './fixtures'
import { Identifier, Caveat, MacaroonClass } from 'lsat-js'

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

export function setSessionSecret(): string {
  process.env.SESSION_SECRET = randomBytes(32).toString('hex')
  return process.env.SESSION_SECRET
}

export const getExpirationCaveat = (time = 1000): Caveat =>
  new Caveat({ condition: 'expiration', value: Date.now() + time })

export function getTestBuilder(secret: string): MacaroonClass {
  const request = lnService.parsePaymentRequest({ request: invoice.payreq })

  const identifier = new Identifier({
    paymentHash: Buffer.from(request.id, 'hex'),
    tokenId: randomBytes(32),
  })
  const builder = Macaroon.newMacaroon({
    version: 1,
    location: 'location',
    rootKey: secret,
    identifier: identifier.toString(),
  })
  return builder
}
