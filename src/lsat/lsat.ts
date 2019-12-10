import assert from 'assert'
import crypto from 'crypto'
import { Struct } from 'bufio'
import { parsePaymentRequest } from 'ln-service'
import { MacaroonsBuilder, Macaroon } from 'macaroons.js'

import { Caveat, Identifier } from '.'
import { LsatOptions } from '../typings'
import { isHex } from '../helpers'

class MacaroonInterface extends Macaroon {}

export class Lsat extends Struct {
  id: string
  validUntil: number
  baseMacaroon: string
  paymentHash: string
  timeCreated: number
  paymentPreimage: string | null
  amountPaid: number | null
  routingFeePaid: number | null

  static type = 'LSAT'

  constructor(options: LsatOptions) {
    super(options)
    this.id = ''
    this.validUntil = 0
    this.baseMacaroon = ''
    this.paymentHash = Buffer.alloc(32).toString('hex')
    this.timeCreated = Date.now()
    this.paymentPreimage = null
    this.amountPaid = 0
    this.routingFeePaid = 0

    if (options) this.fromOptions(options)
  }

  fromOptions(options: LsatOptions): this {
    assert(typeof options.id === 'string', 'Require string id')
    this.id = options.id

    assert(typeof options.baseMacaroon === 'string', 'Require encoded macaroon')
    this.baseMacaroon = options.baseMacaroon

    if (options.paymentHash) this.paymentHash = options.paymentHash
    else {
      // if no paymentHash passed in, then we read it from the macaroon id
      this.paymentHash = this.paymentHashFromMacaroon(this.baseMacaroon)
    }

    const expiration = this.getExpirationFromMacaroon(options.baseMacaroon)
    if (expiration) this.validUntil = expiration

    if (options.timeCreated) this.timeCreated = options.timeCreated

    if (options.paymentPreimage) this.paymentPreimage = options.paymentPreimage

    if (options.amountPaid) this.amountPaid = options.amountPaid

    if (options.routingFeePaid) this.routingFeePaid = options.routingFeePaid

    return this
  }

  isExpired(): boolean {
    if (this.validUntil === 0) return false
    return this.validUntil < Date.now()
  }

  isPending(): boolean {
    return this.paymentPreimage ? false : true
  }

  getMacaroon(): MacaroonInterface {
    return MacaroonsBuilder.deserialize(this.baseMacaroon)
  }

  getExpirationFromMacaroon(macaroon?: string): number {
    if (!macaroon) macaroon === this.baseMacaroon
    assert(macaroon, 'Missing macaroon')

    const { caveatPackets } = MacaroonsBuilder.deserialize(macaroon)

    const expirationCaveats = []

    for (const { rawValue } of caveatPackets) {
      const caveat = Caveat.decode(rawValue.toString())
      if (caveat.condition === 'expiration') expirationCaveats.push(caveat)
    }

    // return zero if no expiration caveat
    if (!expirationCaveats.length) return 0

    // want to return the last expiration caveat
    return Number(expirationCaveats[expirationCaveats.length - 1].value)
  }

  addPreimage(preimage: string): void {
    assert(
      isHex(preimage) && preimage.length === 64,
      'Must pass valid 32-byte hash'
    )

    const hash = crypto
      .createHash('sha256')
      .update(Buffer.from(preimage, 'hex'))
      .digest('hex')

    assert(
      hash === this.paymentHash,
      "Hash of preimage did not match LSAT's paymentHash"
    )
    this.paymentPreimage = preimage
  }

  toToken(): string {
    return `LSAT ${this.baseMacaroon}:${this.paymentPreimage || ''}`
  }

  static paymentHashFromMacaroon(macaroon: string): string {
    const { identifier } = MacaroonsBuilder.deserialize(macaroon)
    let id: Identifier
    try {
      id = Identifier.fromString(identifier)
    } catch (e) {
      throw new Error('Unexpected encoding for macaroon identifier.')
    }
    return id.paymentHash.toString('hex')
  }

  static fromToken(token: string): Lsat {
    assert(token.includes(this.type), 'Token must include LSAT prefix')
    token = token.slice(this.type.length).trim()
    const [macaroon, preimage] = token.split(':')

    const { identifier } = MacaroonsBuilder.deserialize(macaroon)

    return new this({
      baseMacaroon: macaroon,
      id: identifier,
      paymentHash: this.paymentHashFromMacaroon(macaroon),
      paymentPreimage: preimage,
    })
  }

  static fromChallenge(challenge: string): Lsat {
    // challenge should be in base64 encoding, so we need to convert it to utf8 first
    challenge = Buffer.from(challenge, 'base64').toString('utf8')
    const macChallenge = 'macaroon='
    const invoiceChallenge = 'invoice='

    const challenges: string[] = challenge.split(',')

    assert(
      challenges.length >= 2,
      'Expected at least two challenges in the LSAT: invoice and macaroon'
    )

    let macaroon = '',
      invoice = ''

    // get the indexes of the challenge strings so that we can split them
    // kind of convoluted but accounts for challenges being in the wrong order
    // and for excess challenges that we can ignore
    for (const c of challenges) {
      // check if we're looking at the macaroon challenge
      if (!macaroon.length && c.indexOf(macChallenge) > -1) {
        const split = c.split('=')
        assert(split.length === 2, 'Incorrectly encoded macaroon challenge')
        macaroon = split[split.length - 1].trim()
      }

      // check if we're looking at the invoice challenge
      if (!invoice.length && c.indexOf(invoiceChallenge) > -1) {
        const split = c.split('=')
        assert(split.length === 2, 'Incorrectly encoded invoice challenge')
        invoice = split[split.length - 1].trim()
      }
      // if there are other challenges but we have mac and invoice then we can break
      // as they are not LSAT relevant anyway
      if (invoice.length && macaroon.length) break
    }

    assert(
      invoice.length && macaroon.length,
      'Expected base64 encoded challenge with macaroon and invoice data'
    )
    const request = parsePaymentRequest({ request: invoice })
    const paymentHash = request.id
    const { identifier } = MacaroonsBuilder.deserialize(macaroon)

    return new this({
      id: identifier,
      baseMacaroon: macaroon,
      paymentHash,
    })
  }

  static fromHeader(header: string): Lsat {
    // remove the token type prefix to get the challenge
    const challenge = header.slice(this.type.length).trim()

    assert(
      header.length !== challenge.length,
      'header missing token type prefix "LSAT"'
    )

    return Lsat.fromChallenge(challenge)
  }
}