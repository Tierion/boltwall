import { Request } from 'express'
import { BoltwallConfig } from '.'

export interface LndRequest extends Request {
  lnd?: any
  opennode?: any
  hostname: string
  boltwallConfig?: BoltwallConfig
}
