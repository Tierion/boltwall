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
    this.invoice = ''
    this.baseMacaroon = ''
    this.paymentHash = Buffer.alloc(32).toString('hex')
    this.timeCreated = Date.now()
    this.paymentPreimage = null
    this.amountPaid = 0
    this.routingFeePaid = 0

    if (options) this.fromOptions(options)
  }

  fromOptions(options: LsatOptions): this {
    assert(
      typeof options.baseMacaroon === 'string',
      'Require serialized macaroon'
    )
    this.baseMacaroon = options.baseMacaroon

    assert(typeof options.id === 'string', 'Require string id')
    this.id = options.id

    assert(typeof options.paymentHash === 'string', 'Require paymentHash')
    this.paymentHash = options.paymentHash

    const expiration = this.getExpirationFromMacaroon(options.baseMacaroon)
    if (expiration) this.validUntil = expiration

    if (options.invoice) this.invoice = options.invoice

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

  setPreimage(preimage: string): void {
    assert(
      isHex(preimage) && preimage.length === 64,
      'Must pass valid 32-byte hash for lsat secret'
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

  toChallenge(): string {
    assert(
      this.invoice,
      `Can't create a challenge without a payment request/invoice`
    )
    const challenge = `macaroon=${this.baseMacaroon}, invoice=${this.invoice}`
    return `LSAT ${Buffer.from(challenge).toString('base64')}`
  }

  static fromMacaroon(macaroon: string, invoice?: string): Lsat {
    const { identifier } = MacaroonsBuilder.deserialize(macaroon)
    let id: Identifier
    try {
      id = Identifier.fromString(identifier)
    } catch (e) {
      throw new Error(
        `Unexpected encoding for macaroon identifier: ${e.message}`
      )
    }

    const options: LsatOptions = {
      id: identifier,
      baseMacaroon: macaroon,
      paymentHash: id.paymentHash.toString('hex'),
    }

    if (invoice) {
      const { id: paymentHash, tokens } = parsePaymentRequest({
        request: invoice,
      })
      assert(
        paymentHash === id.paymentHash.toString('hex'),
        'paymentHash from invoice did not match invoice'
      )
      options.amountPaid = tokens
      options.invoice = invoice
    }

    return new this(options)
  }

  static fromToken(token: string): Lsat {
    assert(token.includes(this.type), 'Token must include LSAT prefix')
    token = token.slice(this.type.length).trim()
    const [macaroon, preimage] = token.split(':')
    const { identifier } = MacaroonsBuilder.deserialize(macaroon)
    const id = Identifier.fromString(identifier)
    const lsat = new this({
      baseMacaroon: macaroon,
      id: identifier,
      paymentHash: id.paymentHash.toString('hex'),
    })

    if (preimage) lsat.setPreimage(preimage)
    return lsat
  }

  static fromChallenge(challenge: string): Lsat {
    // challenge should be in base64 encoding, so we need to convert it to utf8 first
    challenge = Buffer.from(challenge, 'base64').toString('utf8')
    const macChallenge = 'macaroon='
    const invoiceChallenge = 'invoice='

    let challenges: string[]

    challenges = challenge.split(',')

    // add support for challenges that are separated with just a space
    if (challenges.length < 2) challenges = challenge.split(' ')

    // if we still don't have at least two, then there was a malformed header/challenge
    assert(
      challenges.length >= 2,
      'Expected at least two challenges in the LSAT: invoice and macaroon'
    )

    let macaroon = '',
      invoice = ''

    // get the indexes of the challenge strings so that we can split them
    // kind of convoluted but it takes into account challenges being in the wrong order
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
      invoice: invoice,
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
