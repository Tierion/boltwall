import { Satisfier } from 'lsat-js'
import { decodeChallengeCaveat } from '../helpers'
import zbase32 from 'zbase32'
import { createHash } from 'crypto'
import { ecdsaVerify } from 'secp256k1'
const condition = 'challenge'

const sha256 = (msg: string | Buffer): Buffer =>
  createHash('sha256')
    .update(msg)
    .digest()

const MSG_PREFIX = 'Lightning Signed Message:'

export const challengeSatisfier: Satisfier = {
  condition,
  satisfyPrevious: (prev, curr) => {
    const prevDecoded = decodeChallengeCaveat(prev.encode())
    const currDecoded = decodeChallengeCaveat(curr.encode())

    if (prevDecoded.challenge !== currDecoded.challenge) return false
    if (prevDecoded.pubkey !== currDecoded.pubkey) return false
    if (!currDecoded.signature) return false

    // satisfies previous if challenge and pubkey are the same
    // and the current caveat has a signature. If these are all
    // true then `satisfyFinal` will be sure to check the signature
    return true
  },
  satisfyFinal: caveat => {
    const { challenge, pubkey, signature } = decodeChallengeCaveat(
      caveat.encode()
    )

    // should fail if challenge or pubkey are missing
    if (!challenge || !pubkey) return false

    // if there's no signature then just assume it's the first challenge caveat
    if (!signature) return true

    // signature is zbase32 encoded
    const sigBuffer = zbase32.decode(signature).slice(1)
    // lightning nodes sign messages by attaching a message prefix and
    // double hashing the value before signing
    const digest = sha256(sha256(MSG_PREFIX + challenge))

    if (sigBuffer.length !== 64) return false

    return ecdsaVerify(sigBuffer, digest, Buffer.from(pubkey, 'hex'))
  },
}
