#!/usr/bin/env node
/* eslint-disable */
const fs = require('fs')
const readline = require('readline')
const path = require('path')
const URL = require('url').URL
const { execSync } = require('child_process')
const crypto = require('crypto')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

rl.question('What is the URL of the config? ', function(configUrl) {
  if (configUrl.indexOf('https://') !== 0) {
    console.error('Invalid URL, must start with "https://"')
    return rl.close()
  }
  try {
    new URL(configUrl)
  } catch (err) {
    console.error(`Invalid URL:`, err.message)
    return rl.close()
  }

  let config = execSync(`curl ${configUrl}`)

  try {
    config = JSON.parse(config.toString())
  } catch (e) {
    console.error(
      'Problem reading config at that URL. Make sure it still exists'
    )
    return rl.close()
  }

  config = config.configurations.find(c => c.type === 'grpc')

  if (!config) {
    console.error(
      'Could not find valid grpc config. Make sure your BTCPay Server is configured to use LND and allow grpc connections: http://docs.btcpayserver.org/faq-and-common-issues/faq-lightningnetwork'
    )
    return rl.close()
  }

  const configPath = path.join(__dirname, '.env')
  const SESSION_SECRET = crypto.randomBytes(32).toString('hex')
  const env = `LND_SOCKET=${config.host}:${config.port}
LND_MACAROON=${config.adminMacaroon}
SESSION_SECRET=${SESSION_SECRET}`

  if (fs.existsSync(configPath)) {
    rl.question(
      'This will overwrite any existing .env (but will backup as .old.env. Would you like to continue? (y/n) ',
      function(answer) {
        if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'no')
          return rl.close()

        execSync(`cp ${configPath} ${path.join(__dirname, '.old.env')}`)
        fs.writeFileSync(configPath, env)
        console.log('Done!')
        rl.close()
      }
    )
  } else {
    fs.writeFileSync(configPath, env)
    console.log('Done!')
    rl.close()
  }
})
