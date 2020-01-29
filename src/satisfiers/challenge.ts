import { Satisfier } from 'lsat-js'
import { decodeChallengeCaveat } from '../helpers'
import { verifySig } from '@lntools/crypto'

const challengeSatisfier: Satisfier = {
  condition: 'challenge',
  satisfyPrevious: (prev, curr) => {
    const prevDecoded = decodeChallengeCaveat(prev.encode())
    const currDecoded = decodeChallengeCaveat(curr.encode())
    if (prevDecoded.challenge !== currDecoded.challenge) return false
    if (prevDecoded.pubkey !== currDecoded.pubkey) return false
    return true
  },
  satisfyFinal: caveat => {
    const { challenge, pubkey, signature } = decodeChallengeCaveat(
      caveat.encode()
    )
    if (!signature) return false
    return verifySig(
      Buffer.from(challenge, 'hex'),
      Buffer.from(signature, 'hex'),
      Buffer.from(pubkey, 'hex')
    )
  },
}

export default challengeSatisfier
