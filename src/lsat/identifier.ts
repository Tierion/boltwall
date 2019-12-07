import assert from 'assert'

import { Struct } from 'bufio'

import { IdentifierOptions } from '../typings'

export const LATEST_VERSION = 0
export const TOKEN_ID_SIZE = 32

export class ErrUnknownVersion extends Error {
  constructor(version: number | string, ...params: any[]) {
    // Pass remaining arguments (including vendor specific ones) to parent constructor
    super(...params)

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ErrUnknownVersion)
    }

    this.name = 'ErrUnknownVersion'
    // Custom debugging information
    this.message = `${this.name}:${version}`
  }
}

export class Identifier extends Struct {
  constructor(options: IdentifierOptions) {
    super(options)

    this.version = LATEST_VERSION
    this.paymentHash = null
    this.tokenId = null

    if (options) this.fromOptions(options)
  }

  fromOptions(options: IdentifierOptions): this {
    if (options.version && options.version > LATEST_VERSION)
      throw new ErrUnknownVersion(options.version)
    else if (options.version) this.version = options.version

    assert(
      typeof this.version === 'number',
      'Identifier version must be a number'
    )

    assert(
      options.paymentHash.length === 32,
      `Expected 32-byte hash, instead got ${options.paymentHash.length}`
    )
    this.paymentHash = options.paymentHash

    assert(
      options.tokenId.length === TOKEN_ID_SIZE,
      'Token Id of unexpected size'
    )
    this.tokenId = options.tokenId

    return this
  }

  toString(): string {
    return this.toHex()
  }

  static fromString(str: string): Identifier {
    return new this().fromHex(str)
  }

  write(bw: any): this {
    bw.writeU16(this.version)

    switch (this.version) {
      case 0:
        // write payment hash
        bw.writeHash(this.paymentHash)

        // check format of tokenId
        assert(
          Buffer.isBuffer(this.tokenId) &&
            this.tokenId.length === TOKEN_ID_SIZE,
          `Token ID must be ${TOKEN_ID_SIZE}-byte hash`
        )

        // write tokenId
        bw.writeBytes(this.tokenId)
        return this
      default:
        throw new ErrUnknownVersion(this.version)
    }
  }

  read(br: any): this {
    this.version = br.readU16()

    switch (this.version) {
      case 0:
        this.paymentHash = br.readHash()
        this.tokenId = br.readBytes(TOKEN_ID_SIZE)
        return this
      default:
        throw new ErrUnknownVersion(this.version)
    }
  }
}
