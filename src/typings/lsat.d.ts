/**
 * Describes the shape of the options for creating a new identifier struct
 * which represents the constant, unique identifiers associated with a macaroon
 */
export interface IdentifierOptions {
  version: number
  paymentHash: Buffer
  tokenId: Buffer
}

/**
 * Describes options to create a caveat. The condition is like the variable
 * and the value is what it is expected to be. Encoded format would be "condition=value"
 */
export interface CaveatOptions {
  condition: string
  value: string
  comp?: string
}
