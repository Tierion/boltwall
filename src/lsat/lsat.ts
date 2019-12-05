import assert from 'assert'
import crypto from 'crypto'
import { Struct } from 'bufio'
import { parsePaymentRequest } from 'ln-service'
import { isHex } from '../helpers'

export class Lsat extends Struct {
  id: string
  validUntil: number
  baseMacaroon: string
  paymentHash: string
  timeCreated: number
  paymentPreimage: string | null
  amountPaid: number | null
  routingFeePaid: number | null

  constructor(options) {
    super(options)
    this.id = ''
    this.validUntil = 0
    this.baseMacaroon = ''
    this.paymentHash = Buffer.alloc(32).toString('hex')
    this.timeCreated = Date.now()
    this.paymentPreimage = null
    this.amountPaid = 0
    this.routingFeePaid = 0
  }

  isExpired(): boolean {
    return this.validUntil > Date.now()
  }

  isPending(): boolean {
    return this.paymentPreimage ? false : true
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

  static fromChallenge(challenge: string): Lsat {
    return new this()
  }
}
