import { Request } from 'express'
import { CaveatConfig } from '.'

export interface LndRequest extends Request {
  lnd?: any
  opennode?: any
  hostname: string
  caveatConfig?: CaveatConfig
}
