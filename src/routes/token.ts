import { Response, Request, Router, NextFunction } from 'express'
import { Lsat } from 'lsat-js'
import { checkInvoiceStatus, decodeChallengeCaveat } from '../helpers'
import lnService from 'ln-service'
import { MacaroonsBuilder } from 'macaroons.js'

const router: Router = Router()

export async function satisfyTokenChallenge(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> {
  if (!req.body || !req.body.macaroon) {
    res.status(400)
    return next({ message: 'Missing macaroon in request body' })
  }

  let lsat
  try {
    lsat = Lsat.fromMacaroon(req.body.macaroon)
  } catch (e) {
    res.status(400)
    req.logger.error('There was a problem parsing macaroon:', e)
    return next({ message: 'Could not parse macaroon in request' })
  }

  const caveats = lsat.getCaveats().filter(c => c.condition === 'challenge')

  if (!caveats.length) {
    res.status(400)
    return next({ message: 'Missing challenge caveat in macaroon' })
  }

  const caveat = caveats[caveats.length - 1]

  const { challenge, pubkey, signature: sig } = decodeChallengeCaveat(
    caveat.encode()
  )
  if (!req.lnd) {
    res.status(501)
    return next({ message: 'Node does not support this method' })
  }

  const { public_key: nodePubkey } = await lnService.getWalletInfo({
    lnd: req.lnd,
  })

  if (pubkey !== nodePubkey) {
    res.status(400)
    return next({ message: 'Request made with unknown public key' })
  }

  if (sig) {
    res.status(400)
    return next({ message: 'Macaroon already contains a token' })
  }

  const invoiceResponse = await checkInvoiceStatus(
    lsat.paymentHash,
    req.lnd,
    req.opennode
  )

  if (invoiceResponse.status === 'unpaid') {
    res.status(401)
    return next({ message: 'Unauthorized: Token requested for unpaid invoice' })
  }

  // sign challenge
  const { signature } = await lnService.signMessage({
    lnd: req.lnd,
    message: challenge,
  })

  // add signature to original challenge caveat
  caveat.value = caveat.value + signature

  // add new caveat to macaroon
  const builder = MacaroonsBuilder.modify(lsat.getMacaroon())
  builder.add_first_party_caveat(caveat.encode())

  // if there are any other custom caveats on the config
  // loop through and add those caveats to the new macaroon
  if (req.boltwallConfig && req.boltwallConfig.getCaveats) {
    let getCaveats = req.boltwallConfig.getCaveats
    if (!Array.isArray(getCaveats)) getCaveats = [getCaveats]

    for (const getter of getCaveats) {
      builder.add_first_party_caveat(getter(req, invoiceResponse))
    }
  }
  const macaroon = builder.getMacaroon().serialize()
  return res.json({ macaroon })
}

router.route('*/token').post(satisfyTokenChallenge)

export default router
