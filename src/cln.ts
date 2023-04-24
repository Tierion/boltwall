import * as fs from 'fs'
import * as grpc from 'grpc'
export const loadMTLSCredentials = (
  tls_location: string,
  tls_key_location: string,
  tls_chain_location: string
) => {
  try {
    const glCert = fs.readFileSync(tls_location)
    const glPriv = fs.readFileSync(tls_key_location)
    const glChain = fs.readFileSync(tls_chain_location)
    return grpc.credentials.createSsl(glCert, glPriv, glChain)
  } catch (error) {
    throw error
  }
}

export async function loadCln(
  tls_location: string,
  tls_key_location: string,
  tls_chain_location: string,
  cln_uri: string
) {
  try {
    const credentials = loadMTLSCredentials(
      tls_location,
      tls_key_location,
      tls_chain_location
    )
    const descriptor = grpc.load('proto/cln.proto')
    const cln = descriptor.cln
    const options = {
      'grpc.ssl_target_name_override': 'localhost',
    }

    const uri = cln_uri
    //@ts-ignore
    let lightningClient = new cln.Node(uri, credentials, options)
    return lightningClient
  } catch (error) {
    throw error
  }
}
