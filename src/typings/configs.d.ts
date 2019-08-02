import { CaveatGetter, CaveatVerifier, LndRequest } from '.'

export interface DescriptionGetter {
  (req: LndRequest): string
}

export interface BoltwallConfig {
  getCaveat?: CaveatGetter
  caveatVerifier?: CaveatVerifier
  getInvoiceDescription?: DescriptionGetter
}
