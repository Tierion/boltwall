import assert from 'assert'
import { Struct } from 'bufio'
import crypto from 'crypto'
import uuidv4 from 'uuid/v4'

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

/**
 * @description An identifier encodes information about our LSAT that can be used as a unique identifier
 * and is used to generate a macaroon.
 * @extends Struct
 */
export class Identifier extends Struct {
  /**
   *
   * @param {Object} options - options to create a new Identifier
   * @param {number} version - version of the identifier used to determine encoding of the raw bytes
   * @param {Buffer} paymentHash - paymentHash of the invoice associated with the LSAT.
   * @param {Buffer} tokenId - random 32-byte id used to identify the LSAT by
   */
  constructor(options: IdentifierOptions | void) {
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

    // TODO: generate random uuidv4 id (and hash to 32 to match length)
    if (!options.tokenId) {
      const id = uuidv4()
      this.tokenId = crypto
        .createHash('sha256')
        .update(Buffer.from(id))
        .digest()
    } else {
      this.tokenId = options.tokenId
    }
    assert(this.tokenId.length === TOKEN_ID_SIZE, 'Token Id of unexpected size')

    return this
  }

  /**
   * Convert lsat to string
   * @returns {string}
   */
  toString(): string {
    return this.toHex()
  }

  static fromString(str: string): Identifier {
    return new this().fromHex(str)
  }

  /**
   * Utility for encoding the Identifier into a buffer based on version
   * @param {bufio.BufferWriter} bw - Buffer writer for creating an Identifier Buffer
   * @returns {Identifier}
   */
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

  /**
   * Utility for reading raw Identifier bytes and converting to a new Identifier
   * @param {bufio.BufferReader} br - Buffer Reader to read bytes
   * @returns {Identifier}
   */
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
