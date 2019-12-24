/* eslint-disable @typescript-eslint/no-explicit-any */
declare namespace Express {
  export interface Request {
    logger: import('./logger').LoggerInterface
    boltwallConfig?: import('./configs').BoltwallConfig
    lnd?: any
    opennode?: any
    hostname: string
  }
}
