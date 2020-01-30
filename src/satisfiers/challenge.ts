import { Satisfier } from 'lsat-js'
import { decodeChallengeCaveat } from '../helpers'
import { verifySig } from '@lntools/crypto'

const condition = 'challenge'

// singleton to keep track of whether we are on the challenge caveat
// or the answer caveat (the challenge caveat with the signature)
let callCount = 0

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
    // but if any other instance does not have signature then it should fail
    if (!signature && callCount === 1) return true
    else if (!signature) {
      // when missing a signature, always keep count at 1 to indicate waiting
      // for the next challenge caveat with the signature
      callCount = 1
      return false
    }

    // if we're checking a signature then we can reset the call count
    callCount = 0
    return verifySig(
      Buffer.from(challenge, 'hex'),
      Buffer.from(signature, 'hex'),
      Buffer.from(pubkey, 'hex')
    )
  },
}

export default challengeSatisfier
