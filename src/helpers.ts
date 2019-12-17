import { Request } from 'express'
import assert from 'assert'
import { MacaroonsBuilder, MacaroonsConstants } from 'macaroons.js'
import dotenv from 'dotenv'
import Macaroon from 'macaroons.js/lib/Macaroon'
import crypto from 'crypto'
import lnService from 'ln-service'
import binet from 'binet'

import { InvoiceResponse, CaveatGetter } from './typings'
import { Lsat, Identifier } from './lsat'

const { MACAROON_SUGGESTED_SECRET_LENGTH } = MacaroonsConstants

interface EnvVars {
  PORT?: string
  OPEN_NODE_KEY?: string | undefined
  LND_TLS_CERT?: string
  LND_MACAROON?: string
  SESSION_SECRET: string
  CAVEAT_KEY?: string
  LND_SOCKET?: string
}

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
    CAVEAT_KEY: process.env.CAVEAT_KEY as string,
    LND_SOCKET: process.env.LND_SOCKET as string,
  }
}

export function testEnvVars(): boolean | Error {
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

  // if we have some lnd configs but not all, throw that we're missing some
  if (lndConfigs.some(config => config === undefined))
    throw new Error(
      'Missing configs to connect to LND node. Need LND_TLS_CERT, LND_MACAROON, LND_SOCKET.'
    )

  // otherwise we have no lnd configs and no OPEN_NODE_KEY
  // throw that there are no ln configs
  throw new Error(
    'No configs set in environment to connect to a lightning node. \
See README for instructions: https://github.com/Tierion/boltwall'
  )
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
  const location = getLocation(req)

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

  const macaroon = builder.getMacaroon()
  return Lsat.fromMacaroon(macaroon.serialize(), payreq)
}

/**
 * Utility to create an invoice based on either an authenticated lnd grpc instance
 * or an opennode connection
 * @param {Object} req - express request object that either contains an lnd or opennode object
 * @returns {Object} invoice - returns an invoice with a payreq, id, description, createdAt, and
 */
export async function createInvoice(req: Request): Promise<InvoiceResponse> {
  const { lnd, opennode, body, boltwallConfig } = req
  const { time, expiresAt, amount } = body // time in seconds

  let tokens = time || amount

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
    _description = await boltwallConfig.getInvoiceDescription(req)

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

/*
 * returns a set of mostly constants that describes the first party caveat
 * this is set on a root macaroon. Supports an empty invoiceId
 * since we can use this for matching the prefix on a populated macaroon caveat
 */

export function getFirstPartyCaveat(invoiceId = ''): FirstPartyCaveat {
  return {
    key: 'invoiceId',
    value: invoiceId,
    separator: '=',
    caveat: `invoiceId = ${invoiceId}`,
    prefixMatch: (value: string): boolean => /invoiceId = .*/.test(value),
  }
}

/**
 * Given an invoice object and a request
 * we want to create a root macaroon with a third party caveat, which both need to be
 * satisfied in order to authenticate the macaroon
 * @param {invoice.id} - invoice must at least have an id for creating the 3rd party caveat
 * @param {Object} req - request object is needed for identification of the macaroon, in particular
 * the headers and the originating ip
 * @param {Boolean} has3rdPartyCaveat
 * @returns {Macaroon} - serialized macaroon object
 */

export async function createRootMacaroon(
  invoiceId: string,
  location: string,
  has3rdPartyCaveat = false
): Promise<string> {
  if (!invoiceId)
    throw new Error(
      'Missing an invoice object with an id. Cannot create macaroon'
    )

  const { SESSION_SECRET: secret, CAVEAT_KEY: caveatKey } = getEnvVars()

  const publicIdentifier = 'session secret'
  // caveat is created to make sure invoice id matches when validating with this macaroon
  const { caveat } = getFirstPartyCaveat(invoiceId)
  const builder = new MacaroonsBuilder(
    location,
    secret,
    publicIdentifier
  ).add_first_party_caveat(caveat)

  // when protecting "local" content, i.e. this is being used as a paywall to protect
  // content in the same location as the middleware is implemented, then the third party
  // caveat is discharged by the current host as well, so location is the same for both.
  // In alternative scenarios, where now-paywall is being used to authenticate access at another source
  // then this will be different. e.g. see Prism Reader as an example
  if (has3rdPartyCaveat && !caveatKey)
    throw new Error(
      'Missing caveat key in environment variables necessary for third party macaroon verification'
    )

  let macaroon

  if (has3rdPartyCaveat)
    macaroon = builder
      .add_third_party_caveat(location, caveatKey, invoiceId)
      .getMacaroon()
  else macaroon = builder.getMacaroon()

  return macaroon.serialize()
}

/**
 * Checks the status of an invoice given an id
 * @param {express.request} - request object from expressjs
 * @param {req.query.id} invoiceId - id of invoice to check status of
 * @param {req.lnd} [lnd] - ln-service authenticated grpc object
 * @param {req.opennode} [opennode] - authenticated opennode object for communicating with OpenNode API
 * @returns {Object} - status - Object with status, amount, and payment request
 */

export async function checkInvoiceStatus(
  lnd: any,
  opennode: any,
  invoiceId: string,
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
 * Returns serealized discharge macaroon, signed with the server's caveat key
 * and with an attached caveat (if passed)
 * @param {Express.request} - req object
 * @param {String} caveat - first party caveat such as `time < ${now + 1000 seconds}`
 * @returns {Macaroon} discharge macaroon
 */
export function getDischargeMacaroon(
  invoiceId: string,
  location: string,
  caveat?: string
): string {
  if (!invoiceId) throw new Error('Missing invoiceId in request')

  const { CAVEAT_KEY } = getEnvVars()

  // check if there is a caveat key before proceeding
  if (!CAVEAT_KEY)
    throw new Error(
      'Service is missing caveat key for signing discharge macaroon. Contact node admin.'
    )

  // create discharge macaroon

  // Now that we've confirmed invoice is paid, create the discharge macaroon
  let macaroon = new MacaroonsBuilder(
    location,
    CAVEAT_KEY, // this should be randomly generated, w/ enough entropy and of length > 32 bytes
    invoiceId
  )

  if (caveat) macaroon.add_first_party_caveat(caveat)

  macaroon = macaroon.getMacaroon()

  return macaroon.serialize()
}

/**
 * Utility to extract first party caveat value from a serialized root macaroon
 * See `getFirstPartyCaveat` for what this value represents
 */
export function getFirstPartyCaveatFromMacaroon(
  serialized: Macaroon
): string | void {
  const macaroon = MacaroonsBuilder.deserialize(serialized)
  const firstPartyCaveat = getFirstPartyCaveat()
  for (let caveat of macaroon.caveatPackets) {
    caveat = caveat.getValueAsText()
    // find the caveat where the prefix matches our root caveat
    if (firstPartyCaveat.prefixMatch(caveat)) {
      // split on the separator, which should be an equals sign
      const [, value] = caveat.split(firstPartyCaveat.separator)
      // return value of the first party caveat (e.g. invoice id)
      return value.trim()
    }
  }
}

export function isHex(h: string): boolean {
  return Buffer.from(h, 'hex').toString('hex') === h
}

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

type prefixMatchFn = (value: string) => boolean
interface FirstPartyCaveat {
  key: string
  value?: string
  separator: string
  caveat: string
  prefixMatch: prefixMatchFn
}
