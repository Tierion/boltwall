const {
  MacaroonsBuilder,
  MacaroonsVerifier,
  MacaroonsConstants: { MACAROON_SUGGESTED_SECRET_LENGTH },
  verifier: { TimestampCaveatVerifier },
} = require('macaroons.js')
import dotenv from 'dotenv'
import Macaroon from 'macaroons.js/lib/Macaroon'
import crypto from 'crypto'
const lnService = require('ln-service')

import { LndRequest, InvoiceResponse, CaveatVerifier } from './typings'

export function getEnvVars(): any {
  dotenv.config()

  if (!process.env.SESSION_SECRET) {
    console.log(
      `No session secret set. Generating random ${MACAROON_SUGGESTED_SECRET_LENGTH} byte value for signing macaroons.`
    )
    process.env.SESSION_SECRET = crypto
      .randomBytes(MACAROON_SUGGESTED_SECRET_LENGTH)
      .toString('hex')
  }

  return {
    PORT: process.env.PORT as string,
    OPEN_NODE_KEY: process.env.OPEN_NODE_KEY as string,
    LND_TLS_CERT: process.env.LND_TLS_CERT as string,
    LND_MACAROON: process.env.LND_MACAROON as string,
    SESSION_SECRET: process.env.LND_MACAROON as string,
    CAVEAT_KEY: process.env.CAVEAT_KEY as string,
    LND_SOCKET: process.env.LND_SOCKET as string,
  }
}

export function testEnvVars() {
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
      'Missing configs to connect to LND node. Need macaroon, socket, and tls cert.'
    )

  // otherwise we have no lnd configs and no OPEN_NODE_KEY
  // throw that there are no ln configs
  throw new Error(
    'No configs set in environment to connect to a lightning node. \
See README for instructions: https://github.com/boltwall-org/boltwall'
  )
}

/**
 * Utility to create an invoice based on either an authenticated lnd grpc instance
 * or an opennode connection
 * @params {Object} req - express request object that either contains an lnd or opennode object
 * @returns {Object} invoice - returns an invoice with a payreq, id, description, createdAt, and
 */
export async function createInvoice(req: LndRequest): Promise<InvoiceResponse> {
  const { lnd, opennode, body, boltwallConfig } = req
  let { time, expiresAt, amount } = body // time in seconds

  const tokens = time || amount

  // need to check if the invoice request does not meet payment threshold in config
  if (
    boltwallConfig &&
    boltwallConfig.minAmount &&
    (tokens < boltwallConfig.minAmount || !tokens)
  )
    throw new Error(
      'Amount set in invoice request is below minimum amount for payment.'
    )

  // helpful to warn that we're creating a free invoice
  // though this could be useful in donation scenarios
  if (!amount || !time)
    console.warn(
      'Create invoice request has no amount set. \
This means payer can pay whatever they want for access.'
    )

  let _description

  if (boltwallConfig && boltwallConfig.getInvoiceDescription)
    _description = boltwallConfig.getInvoiceDescription(req)

  let invoice: InvoiceResponse

  if (lnd) {
    const {
      request: payreq,
      id,
      description = _description,
      created_at: createdAt,
      tokens: amount,
    } = await lnService.createInvoice({
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
 * Given an invoice object and a request
 * we want to create a root macaroon with a third party caveat, which both need to be
 * satisfied in order to authenticate the macaroon
 * @params {invoice.id} - invoice must at least have an id for creating the 3rd party caveat
 * @params {Object} req - request object is needed for identification of the macaroon, in particular
 * the headers and the originating ip
 * @params {Boolean} has3rdPartyCaveat
 * @returns {Macaroon} - serialized macaroon object
 */

export async function createRootMacaroon(
  invoiceId: string,
  location: string,
  has3rdPartyCaveat: boolean = false
) {
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
 * @params {express.request} - request object from expressjs
 * @params {req.query.id} invoiceId - id of invoice to check status of
 * @params {req.lnd} [lnd] - ln-service authenticated grpc object
 * @params {req.opennode} [opennode] - authenticated opennode object for communicating with OpenNode API
 * @returns {Object} - status - Object with status, amount, and payment request
 */

export async function checkInvoiceStatus(
  lnd: any,
  opennode: any,
  invoiceId: string
): Promise<InvoiceResponse> {
  if (!invoiceId) throw new Error('Missing invoice id.')

  let status, amount, payreq, createdAt
  if (lnd) {
    const invoiceDetails = await lnService.getInvoice({
      id: invoiceId,
      lnd: lnd,
    })
    status = invoiceDetails['is_confirmed'] ? 'paid' : 'unpaid'
    amount = invoiceDetails.tokens
    payreq = invoiceDetails.request
    createdAt = invoiceDetails.created_at
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

  return { status, amount, payreq, id: invoiceId, createdAt }
}

/**
 * Validates a macaroon and should indicate reason for failure
 * if possible
 * @params {Macaroon} root - root macaroon
 * @params {Macaroon} discharge - discharge macaroon from 3rd party validation
 * @params {String} exactCaveat - a first party, exact caveat to test on root macaroon
 * @returns {Boolean|Exception} will return true if passed or throw with failure
 */
export function validateMacaroons(
  root: Macaroon,
  discharge: Macaroon,
  firstPartyCaveat: FirstPartyCaveat,
  caveatVerifier?: CaveatVerifier
) {
  root = MacaroonsBuilder.deserialize(root)
  discharge = MacaroonsBuilder.deserialize(discharge)

  const boundMacaroon = MacaroonsBuilder.modify(root)
    .prepare_for_request(discharge)
    .getMacaroon()

  const { SESSION_SECRET } = getEnvVars()

  // lets verify the macaroon caveats
  const verifier = new MacaroonsVerifier(root)
    // root macaroon should have a caveat to match the docId
    .satisfyExact(firstPartyCaveat.caveat)
    // confirm that the payment node has discharged appropriately
    .satisfy3rdParty(boundMacaroon)

  if (caveatVerifier) verifier.satisfyGeneral(caveatVerifier)

  // if it's valid then we're good to go
  if (verifier.isValid(SESSION_SECRET)) return true

  // if not valid, let's check if it's because of time or because of docId mismatch
  const TIME_CAVEAT_PREFIX = /time < .*/

  // find time caveat in third party macaroon and check if time has expired
  for (let caveat of boundMacaroon.caveatPackets) {
    caveat = caveat.getValueAsText()
    if (TIME_CAVEAT_PREFIX.test(caveat) && !TimestampCaveatVerifier(caveat))
      throw new Error(`Time has expired for accessing content`)
  }

  for (let rawCaveat of root.caveatPackets) {
    const caveat = rawCaveat.getValueAsText()
    // TODO: should probably generalize the exact caveat check or export as constant.
    // This would fail even if there is a space missing in the caveat creation
    if (
      firstPartyCaveat.prefixMatch(caveat) &&
      caveat !== firstPartyCaveat.caveat
    ) {
      throw new Error(`${firstPartyCaveat.key} did not match with macaroon`)
    }
  }
}

/**
 * Returns serealized discharge macaroon, signed with the server's caveat key
 * and with an attached caveat (if passed)
 * @params {Express.request} - req object
 * @params {String} caveat - first party caveat such as `time < ${now + 1000 seconds}`
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
export function getFirstPartyCaveatFromMacaroon(serialized: Macaroon) {
  let macaroon = MacaroonsBuilder.deserialize(serialized)
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

/**
 * Utility function to get a location string to describe _where_ the server is.
 * useful for setting identifiers in macaroons
 * @params {Express.request} req - expressjs request object
 * @params {Express.request.headers} [headers] - optional headers property added by zeit's now
 * @params {Express.request.hostname} - fallback if not in a now lambda
 * @returns {String} - location string
 */
export function getLocation({ headers, hostname }: LndRequest) {
  return headers
    ? headers['x-forwarded-proto'] + '://' + headers['x-now-deployment-url']
    : hostname || 'self'
}

// returns a set of mostly constants that describes the first party caveat
// this is set on a root macaroon. Supports an empty invoiceId
// since we can use this for matching the prefix on a populated macaroon caveat
export function getFirstPartyCaveat(invoiceId = ''): FirstPartyCaveat {
  return {
    key: 'invoiceId',
    value: invoiceId,
    separator: '=',
    caveat: `invoiceId = ${invoiceId}`,
    prefixMatch: (value: string) => /invoiceId = .*/.test(value),
  }
}

type prefixMatchFn = (value: string) => boolean
interface FirstPartyCaveat {
  key: string
  value?: string
  separator: string
  caveat: string
  prefixMatch: prefixMatchFn
}
