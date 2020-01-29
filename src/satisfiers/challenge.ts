import { Satisfier, Caveat } from 'lsat-js'
import { Request } from 'express'

const challengeSatisfier: Satisfier = {
  condition: 'challenge',
}

export default challengeSatisfier
