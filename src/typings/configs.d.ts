import { CaveatGetter, CaveatVerifier } from '.'

export type DescriptionGetter = (req: LndRequest) => string

export type BoltwallConfig = {
  getCaveat?: CaveatGetter
  caveatVerifier?: CaveatVerifier
  getInvoiceDescription?: DescriptionGetter
}
