import * as fs from 'fs'
import * as grpc from 'grpc'

const loadMTLSCredentials = (
  tls_location: string,
  tls_key_location: string,
  tls_chain_location: string
) => {
  const glCert = fs.readFileSync(tls_location)
  const glPriv = fs.readFileSync(tls_key_location)
  const glChain = fs.readFileSync(tls_chain_location)
  return grpc.credentials.createSsl(glCert, glPriv, glChain)
}

export default async function loadCln(
  tls_location: string,
  tls_key_location: string,
  tls_chain_location: string,
  cln_uri: string
) {
  const credentials = await loadMTLSCredentials(
    tls_location,
    tls_key_location,
    tls_chain_location
  )

  const descriptor = await grpc.load('proto/cln.proto')
  const cln = descriptor.cln
  const options = {
    'grpc.ssl_target_name_override': 'localhost',
  }
  const uri = cln_uri
  //@ts-ignore
  let lightningClient = await new cln.Node(uri, credentials, options)
  return lightningClient
}
// amount_msat: { value: 100000 }, label: "invoice 1"
// async function getInfo() {
//   console.log('===> Trying to see when this logs to the console')
//   const lightning = await loadCln()
//   lightning.invoice(
//     {
//       amount_msat: { amount: { msat: '12' } },
//       label: 'Besting all the way121211qwe',
//       description: 'Happu to do this',
//     },
//     (err: any, response: any) => {
//       if (err) {
//         console.log(err)
//         return
//       }
//       if (response && response) {
//         console.log(response)
//         console.log('No address')
//         return
//       }
//       console.log(response)
//     }
//   )
// }

// getInfo()
