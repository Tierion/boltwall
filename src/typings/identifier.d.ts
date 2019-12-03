/**
 * Describes the shape of the options for creating a new identifier struct
 * which represents the constant, unique identifiers associated with a macaroon
 */
export interface IdentifierOptions {
  version: number
  paymentHash: Buffer
  tokenId: Buffer
}
