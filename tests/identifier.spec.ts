import { expect } from 'chai'
import { randomBytes } from 'crypto'

import {
  Identifier,
  LATEST_VERSION,
  TOKEN_ID_SIZE,
  ErrUnknownVersion,
} from '../src/lsat'

describe.only('LSAT Macaroon Identifier', () => {
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
