import { CaveatGetter, CaveatVerifier } from '.'

export type CaveatConfig = {
  getCaveat?: CaveatGetter
  caveatVerifier?: CaveatVerifier
}
