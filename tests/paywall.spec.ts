import * as request from 'supertest'
import { expect } from 'chai'

import app from '../src/app'

describe('Paywall', () => {
  it('should return 402 with LSAT WWW-Authenticate header if no LSAT present')
  it('should return 402 if request has a macaroon but no secret')
  it('should return a 402 with expiration message if macaroon is expired')
  it('should return a 402 for invalid macaroon')
  it('should return a 200 response for request with valid LSAT')
})
