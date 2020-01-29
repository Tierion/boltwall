/**
 * @file helper functions for use in a boltwall server, including setting up the middleware
 * evaluationg macaroons and lsats, and communicating with the lnd node
 */

import { Request } from 'express'
import assert from 'assert'
import { MacaroonsBuilder, MacaroonsConstants } from 'macaroons.js'
import dotenv from 'dotenv'
import crypto, { sign } from 'crypto'
import lnService from 'ln-service'
import binet from 'binet'
import { parsePaymentRequest } from 'ln-service'

import { InvoiceResponse, CaveatGetter, LoggerInterface } from './typings'
import { Lsat, Identifier, Caveat } from 'lsat-js'

const { MACAROON_SUGGESTED_SECRET_LENGTH } = MacaroonsConstants

interface EnvVars {
  PORT?: string
  OPEN_NODE_KEY?: string | undefined
  LND_TLS_CERT?: string
  LND_MACAROON?: string
  SESSION_SECRET: string
  LND_SOCKET?: string
}

/**
 * @description Utility function for getting required environment variables
 * It will validate existing env vars and create missing ones that are required
 * and can be generated randomly (namely the SESSION_SECRET for signing macaroons)
 * @returns {EnvVars} environment variables relevant to boltwall operation
 */
export function getEnvVars(): EnvVars {
  dotenv.config()

  if (!process.env.SESSION_SECRET) {
    // eslint-disable-next-line no-console
    console.log(
      `No session secret set. Generating random ${MACAROON_SUGGESTED_SECRET_LENGTH} byte value for signing macaroons.`
    )
    process.env.SESSION_SECRET = crypto
      .randomBytes(MACAROON_SUGGESTED_SECRET_LENGTH)
      .toString('hex')
  }

  const { LND_TLS_CERT, LND_MACAROON, LND_SOCKET } = process.env

  const hasLndConfigs: boolean =
    LND_TLS_CERT || LND_MACAROON || LND_SOCKET ? true : false

  return {
    PORT: process.env.PORT as string,
    // only pass open node key if we don't have any lnd configs
    OPEN_NODE_KEY: !hasLndConfigs
      ? (process.env.OPEN_NODE_KEY as string)
      : undefined,
    LND_TLS_CERT: process.env.LND_TLS_CERT as string,
    LND_MACAROON: process.env.LND_MACAROON as string,
    SESSION_SECRET: process.env.SESSION_SECRET as string,
    LND_SOCKET: process.env.LND_SOCKET as string,
  }
}

/**
 * @description evaluates environment variables and throws errors
 * based on what might be missing but required
 * @property {Request.logger} logger - logger object for returning messages
 */
export function testEnvVars(logger: LoggerInterface): boolean | Error {
  const {
    OPEN_NODE_KEY,
    LND_TLS_CERT,
    LND_MACAROON,
    LND_SOCKET,
    SESSION_SECRET,
  } = getEnvVars()

  // first check if we have a session secret w/ sufficient bytes
  if (
    !SESSION_SECRET ||
    SESSION_SECRET.length < MACAROON_SUGGESTED_SECRET_LENGTH
  )
    throw new Error(
      'Must have a SESSION_SECRET env var for signing macaroons with minimum lenght of 32 bytes.'
    )

  // next check lnd configs
  const lndConfigs = [LND_TLS_CERT, LND_MACAROON, LND_SOCKET]

  // if we have all lndConfigs then return true
  if (lndConfigs.every(config => config !== undefined)) return true

  // if we have no lnd configs but an OPEN_NODE_KEY then return true
  if (lndConfigs.every(config => config === undefined) && OPEN_NODE_KEY)
    return true

  // if missing LND_SOCKET then throw an error since this is bare minimum needed to make connection
  if (lndConfigs.some(config => config === undefined) && !LND_SOCKET)
    throw new Error(
      'Missing configs for making LND connection. Require at least LND_SOCKET or OPEN_NODE_KEY'
    )

  // Can make a connection w/ lnd_socket only if node is configured to accept connections
  if (LND_SOCKET) {
    logger.debug(
      `Missing configs could cause connection issues: ${
        LND_TLS_CERT ? '' : 'LND_TLS_CERT '
      }${LND_MACAROON ? '' : 'LND_MACAROON'}`
    )
    return true
  }

  // otherwise we have no lnd configs and no OPEN_NODE_KEY
  // throw that there are no ln configs
  throw new Error(
    'No configs set in environment to connect to a lightning node. \
See README for instructions: https://github.com/Tierion/boltwall'
  )
}

/**
 * @description A utility function to create a caveat for use in first party macaroon
 * based OAuth protocols
 * @param payreq - BOLT11 payment request to generate challenge from
 * @returns string encoded caveat of the form `challenge=[random 32 byte string]:[destination pubkey]`
 */
export function createChallengeCaveat(payreq: string): string {
  const details = parsePaymentRequest({ request: payreq })
  const challenge = crypto.randomBytes(32).toString('hex')
  const caveat = new Caveat({
    condition: 'challenge',
    value: `${challenge}:${details.destination}:`,
  })
  return caveat.encode()
}

/**
 * Utility function to get a location string to describe _where_ the server is.
 * useful for setting identifiers in macaroons
 * @param {Express.request} req - expressjs request object
 * @param {Express.request.headers} [headers] - optional headers property added by zeit's now
 * @param {Express.request.hostname} - fallback if not in a now lambda
 * @returns {String} - location string
 */
export function getLocation({ headers, hostname }: Request): string {
  return headers && headers['x-now-deployment-url']
    ? headers['x-forwarded-proto'] + '://' + headers['x-now-deployment-url']
    : hostname || 'self'
}

/**
 * @description Given a request and an invoice, generate a new LSAT including building
 * and signing a new macaroon based on the user defined boltwall config
 * @param {Request} req
 * @param {InvoiceResponse} invoice
 * @returns {Lsat}
 */
export function createLsatFromInvoice(
  req: Request,
  invoice: InvoiceResponse
): Lsat {
  assert(
    invoice && invoice.payreq && invoice.id,
    'Must pass an invoice with payreq and id to create LSAT'
  )

  const { payreq, id } = invoice
  const identifier = new Identifier({
    paymentHash: Buffer.from(id, 'hex'),
  })
  const { SESSION_SECRET } = getEnvVars()
  let location = getLocation(req)

  if (req.boltwallConfig && req.boltwallConfig.oauth) {
    if (!req.query.auth_uri)
      throw new Error('Missing auth_uri in request query')
    location = req.query.auth_uri
  }

  const builder = new MacaroonsBuilder(
    location,
    SESSION_SECRET,
    identifier.toString()
  )

  // if config has custom caveat getters, need to retrieve them
  // and add first party caveats
  if (req.boltwallConfig && req.boltwallConfig.getCaveats) {
    const { getCaveats } = req.boltwallConfig
    let caveatGetters: CaveatGetter[]

    if (!Array.isArray(getCaveats)) caveatGetters = [getCaveats]
    else caveatGetters = getCaveats

    for (const getCaveat of caveatGetters) {
      const caveat = getCaveat(req, invoice)
      builder.add_first_party_caveat(caveat)
    }
  }

  if (req.boltwallConfig && req.boltwallConfig.oauth) {
    const caveat = createChallengeCaveat(invoice.payreq)
    builder.add_first_party_caveat(caveat)
  }

  const macaroon = builder.getMacaroon()
  return Lsat.fromMacaroon(macaroon.serialize(), payreq)
}

/**
 * @description Utility to create an invoice based on either an authenticated lnd grpc instance
 * or an opennode connection
 * @param {Request} req - express request object that either contains an lnd or opennode object
 * @returns {InvoiceResponse} invoice - returns an invoice with a payreq, id, description, createdAt, and
 */
export async function createInvoice(req: Request): Promise<InvoiceResponse> {
  const { lnd, opennode, body, boltwallConfig, query } = req
  const { expiresAt, amount } = body // time in seconds

  let tokens = query.amount || amount

  // if no amount is sent in the request then we use the min amount
  if (boltwallConfig && boltwallConfig.minAmount && !tokens)
    tokens = boltwallConfig.minAmount

  // need to check if the invoice request does not meet payment threshold in config
  if (
    boltwallConfig &&
    boltwallConfig.minAmount &&
    tokens < boltwallConfig.minAmount
  )
    throw new Error(
      'Amount set in invoice request is below minimum amount for payment.'
    )

  // helpful to warn that we're creating a free invoice
  // though this could be useful in donation scenarios
  if (!tokens)
    req.logger.warning(
      'Create invoice request has no amount set. \
This means payer can pay whatever they want for access.'
    )

  let _description

  if (boltwallConfig && boltwallConfig.getInvoiceDescription)
    _description = boltwallConfig.getInvoiceDescription(req)

  let invoice: InvoiceResponse
  if (lnd) {
    let invoiceFunction = lnService.createInvoice
    if (boltwallConfig && boltwallConfig.hodl)
      invoiceFunction = lnService.createHodlInvoice

    const {
      request: payreq,
      id,
      description = _description,
      created_at: createdAt,
      tokens: amount,
    } = await invoiceFunction({
      lnd: lnd,
      description: _description,
      expires_at: expiresAt,
      tokens,
    })
    invoice = { payreq, id, description, createdAt, amount }
  } else if (opennode) {
    const {
      lightning_invoice: { payreq },
      id,
      description,
      created_at: createdAt,
      amount,
    } = await opennode.createCharge({
      description: _description,
      amount: tokens,
      auto_settle: false,
    })
    invoice = { payreq, id, description, createdAt, amount }
  } else {
    throw new Error(
      'No lightning node information configured on request object'
    )
  }
  return invoice
}

/**
 * @description Checks the status of an invoice given an id (i.e. a payment hash)
 * @param {string} invoiceId - the id or paymentHash of the invoice to check the status of
 * @param {lnd} [lnd] - ln-service authenticated grpc object
 * @param {req.opennode} [opennode] - authenticated opennode object for communicating with OpenNode API
 * @param {boolean} [returnSecret=false] - whether or not to return the paymentHash secret in the response
 * Useful to keep as false for unauthenticated clients who need the secret to prove authorization
 * @returns {InvoiceResponse} invoice - Object with status, amount, and payment request
 */

export async function checkInvoiceStatus(
  invoiceId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lnd?: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opennode?: any,
  returnSecret = false
): Promise<InvoiceResponse> {
  if (!invoiceId) throw new Error('Missing invoice id.')

  let status, amount, payreq, createdAt, secret, description
  if (lnd) {
    const invoiceDetails = await lnService.getInvoice({
      id: invoiceId,
      lnd: lnd,
    })

    // for hodl invoices, status might be "is_held"
    status = invoiceDetails['is_confirmed']
      ? 'paid'
      : invoiceDetails['is_held']
      ? 'held'
      : 'unpaid'
    amount = invoiceDetails.tokens
    payreq = invoiceDetails.request
    createdAt = invoiceDetails.created_at
    secret = invoiceDetails.secret
    description = invoiceDetails.description
  } else if (opennode) {
    const data = await opennode.chargeInfo(invoiceId)
    amount = data.amount
    status = data.status
    payreq = data['lightning_invoice'].payreq
    createdAt = data.created_at
  } else {
    throw new Error(
      'No lightning node information configured on request object'
    )
  }
  const invoice: InvoiceResponse = {
    status,
    amount,
    payreq,
    id: invoiceId,
    createdAt,
    description,
  }
  if (returnSecret && secret && status === 'paid') invoice.secret = secret
  return invoice
}

/**
 * @description Given a string, determine if it is in hex encoding or not.
 * @param {string} h - string to evaluate
 * @returns {boolean}
 */
export function isHex(h: string): boolean {
  return Buffer.from(h, 'hex').toString('hex') === h
}

/**
 * @description A utility function used to determine the origin IP of a given request.
 * The function accounts for different circumstances such as proxies (x-forwarded-for) or
 * use in frameworks that don't support Express's req.ip/req.ips properties.
 * @param {Request} req - request object used to determine the origin
 * @returns {string} ip address where the request originated from
 */
export function getOriginFromRequest(req: Request): string {
  let origin: string
  if (req.ip) origin = req.ip
  else if (req.headers && req.headers['x-forwarded-for']) {
    // for requests that have gone through proxies we need to get
    // the first ip which is of the client
    let proxies = req.headers['x-forwarded-for']
    if (Array.isArray(proxies)) origin = proxies[0]
    else {
      proxies = proxies.split(',')
      origin = proxies[0]
    }
  } else if (req.connection && req.connection.remoteAddress) {
    origin = req.connection.remoteAddress
  } else {
    throw new Error('Could not find an origin on the ip address on the request')
  }

  if (!binet.isIPString(origin)) {
    throw new Error('Origin retrieved from request is an invalid ip address')
  }

  return origin
}

export interface TokenChallenge {
  pubkey: string
  challenge: string
  signature?: string | undefined
}

/**
 * @description parse a challenge caveat to retrieve its individual pieces:
 * pubkey, challenge, and signature
 * @param {String} c - encoded caveat string
 * @returns {TokenChallenge}
 */
export function decodeChallengeCaveat(c: string): TokenChallenge {
  const caveat = Caveat.decode(c)
  assert(
    caveat && caveat.condition === 'challenge',
    'Expected to receive a token challenge caveat'
  )
  if (typeof caveat.value !== 'string')
    throw new Error('Unknown value on challenge caveat')
  let [challenge, pubkey, signature] = caveat.value.split(':')

  challenge = challenge.trim()
  pubkey = pubkey.trim()
  if (signature) signature = signature.trim()
  assert(
    challenge && challenge.length === 64,
    'Expected 32 byte challenge string'
  )
  assert(pubkey && pubkey.length === 66, 'Expected a 33-byte pubkey string')
  const decoded = { challenge, pubkey }
  if (signature && signature.length) return { ...decoded, signature }

  return decoded
}
