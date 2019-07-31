import { Request } from 'express'

export interface LndRequest extends Request {
  lnd?: any
  opennode?: any
  hostname: string
}
