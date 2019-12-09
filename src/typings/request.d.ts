// import { Request } from 'express'
import { BoltwallConfig } from '.'
import { LoggerInterface } from '.'

declare module 'express-serve-static-core' {
  interface Request {
    lnd?: any
    opennode?: any
    hostname: string
    boltwallConfig?: BoltwallConfig
    logger: LoggerInterface
  }
}

// export interface LndRequest extends Request {
//   lnd?: any
//   opennode?: any
//   hostname: string
//   boltwallConfig?: BoltwallConfig
//   logger: LoggerInterface
// }

/**
 * @description This describes the body for a request to create an invoice.
 * It includes optional paymentHash prop needed for hodl invoices
 */
export interface InvoiceBody {
  time?: string
  amount?: string | number
  expiresAt?: string
  description?: string
  paymentHash?: string
  cltvDelta?: string | number
}
