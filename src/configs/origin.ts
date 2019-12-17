import { Request } from 'express'
import { BoltwallConfig, DescriptionGetter, CaveatGetter } from '../typings'
import { Caveat, satisfiers } from '../lsat'
import { getOriginFromRequest } from '../helpers'

const getOriginInvoiceDescription: DescriptionGetter = () =>
  `Request made for authorization restricted to single origin`

const getOriginCaveat: CaveatGetter = (req: Request) => {
  const origin = getOriginFromRequest(req)
  const caveat = new Caveat({ condition: 'ip', value: origin })
  return caveat.encode()
}

const ORIGIN_CAVEAT_CONFIGS: BoltwallConfig = {
  minAmount: 1,
  getInvoiceDescription: getOriginInvoiceDescription,
  getCaveats: getOriginCaveat,
  caveatSatisfiers: satisfiers.originSatisfier,
}

export default ORIGIN_CAVEAT_CONFIGS
