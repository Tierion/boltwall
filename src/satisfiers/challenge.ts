import { Satisfier } from 'lsat-js'
import { decodeChallengeCaveat } from '../helpers'
import zbase32 from 'zbase32'
import { createHash } from 'crypto'
import { ecdsaVerify } from 'secp256k1'
const condition = 'challenge'

// singleton to keep track of whether we are on the challenge caveat
// or the answer caveat (the challenge caveat with the signature)
let callCount = 0
const sha256 = (msg: string | Buffer): Buffer =>
  createHash('sha256')
    .update(msg)
    .digest()
const MSG_PREFIX = 'Lightning Signed Message:'
const challengeSatisfier: Satisfier = {
  condition,
  satisfyPrevious: (prev, curr) => {
    const prevDecoded = decodeChallengeCaveat(prev.encode())
    const currDecoded = decodeChallengeCaveat(curr.encode())

    if (prevDecoded.challenge !== currDecoded.challenge) return false
    if (prevDecoded.pubkey !== currDecoded.pubkey) return false
    if (!currDecoded.signature) return false
    return true
  },
  satisfyFinal: caveat => {
    callCount++

    const { challenge, pubkey, signature } = decodeChallengeCaveat(
      caveat.encode()
    )

    // first challenge caveat is not expected to have a signature
    if (!signature && callCount === 1) return true
    // but if any other instance does not have signature then it should fail
    else if (!signature) {
      // reset count, not allowing for multiple challenge caveats for same pubkey
      // if second one doesn't have a signature
      // TODO: confirm if this is the behavior we want and works for more traffic
      callCount = 0
      return false
    }

    // if we're checking a signature then we reset the call count
    callCount = 0

    // signature is zbase32 encoded
    const sigBuffer = zbase32.decode(signature).slice(1)
    // lightning nodes sign messages by attaching a message prefix and
    // double hashing the value before signing
    const digest = sha256(sha256(MSG_PREFIX + challenge))

    if (sigBuffer.length !== 64) return false

    return ecdsaVerify(sigBuffer, digest, Buffer.from(pubkey, 'hex'))
  },
}

export default challengeSatisfier
