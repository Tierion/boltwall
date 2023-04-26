/**
 * @description Extends express's Request object to include
 * custom objects used in boltwall such as a config, logger,
 * and authenticated lnd object
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
declare namespace Express {
  export interface Request {
    logger: import('./logger').LoggerInterface
    boltwallConfig?: import('./configs').BoltwallConfig
    lnd?: any
    opennode?: any
    hostname: string
    cln?: any
  }
}
