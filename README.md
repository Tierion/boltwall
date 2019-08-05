# ⚡️ Boltwall ⚡️

A lightning-based paywall middlware for Nodejs + Expressjs API services. Built with Typescript.

### Supported Features

- Protect routes in your own API by using as a middleware
- Custom attenuation via macaroons
- oAuth-like authorization for compatible 3rd party services

To run the test server, clone the repo, and from the directory run:

```bash
$ yarn install
$ yarn start
```

## System Requirements

- Node > 11.10.0
- npm > 6.9.0

Your project must also use `Expressjs` 4.x as well as the `cors` and `body-parser` middleware.

## Usage

To use as a middleware in an existing server, just install from npm into your project,
and use before all routes that you want protected.

An example project can be seen in `src/server.ts`. This is what is run when running `yarn start`.

A very simple server file, with no special configurations, could look like this:

```javascript
const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')

const boltwall = require('boltwall')

const app = express()

// middleware
app.use(cors())
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))
// parse application/json
app.use(bodyParser.json())

app.get('/', (_req, res) => {
  return res.json({
    message: 'Home route comes before boltwall and so is unprotected.',
  })
})
app.use(boltwall())
app.get('/protected', (_req, res) =>
  res.json({
    message:
      'Protected route! This message will only be returned if an invoice has been paid',
  })
)

app.listen(5000, () => console.log('listening on port 5000!'))
```

## Required Environment Variables

Several environment variables are required when running `boltwall`. These serve the purpose of connecting to your
lightning node and managing/signing macaroons for authentication/authorization.

**The required environment variables are:**

- Lightning configs (either lnd connection info or OpenNode API key based on connection type)
- Session secret- For signing of all macaroons originating from your server.
- Caveat key- this is used for authenticating macaroons in custom authorization schemes.
  Only required if using a custom caveats (such as time based restrictions)

### Lightning Configs

If you are connecting to a lightning node you will need the following in your project's `.env` file
or in `process.env`

Learn how to find these values [in this article](https://medium.com/@wbobeirne/making-a-lightning-web-app-part-1-4a13c82f3f78)
by Will O'Beirne. You can also try this tool by [lightning joule](https://lightningjoule.com/tools/node-info)

```
LND_TLS_CERT=[BASE64 or HEX encoded cert here]
LND_MACAROON=[BASE64 or HEX encoded cert here]
LND_SOCKET=[address of node here, e.g. localhost:10006]
```

If you are using OpenNode for managing payments, [create an OpenNode account](https://dev.opennode.co),
generate an API key and save it as:

```
OPEN_NODE_KEY=[API KEY HERE]
```

If you have both the lnd configs and open node, lnd will take precedence.

Finally, you will need a caveat key for enabling authorization with compatible 3rd party applications
(such as [Prism](https://github.com/bucko13/prism)) and a SESSION_SECRET for securing macaroons.

```
CAVEAT_KEY=[ENTER PASSWORD]
SESSION_SECRET=[RANDOM STRING MINIMUM 32 BYTES IN LENGTH]
```

## Custom Authorization w/ Macaroons

Boltwall allows for flexible authorization schemes. Effectively, this means that a server
that is implementing Boltwall to protect content can dictate factors such as how long
authorization is valid for based off of a payment or restrict access to only the originating IP.

As an example, the configuration in the example file `src/server.ts`, sets up authorization that
is valid for a time where for each satoshi paid in the lightning invoice is equivalent to 1 second.
So if a user pays a 30 satoshi invoice, then access is allowed for 30 seconds.

The config object should be passed to `boltwall` on initialization. e.g. `app.use(boltwall(myConfig))`, where `myConfig` provides the relevant properties. Currently, the config supports
three properties: `caveatVerifier`(func), `getCaveat` (func), and `getInvoiceDescription`.

More information on the configs can be found in the
[API Documentation](https://boltwall-org.github.io/boltwall/interfaces/_src_typings_configs_d_.boltwallconfig.html).

## 3rd Party Caveats and Discharge Macaroons

The use of macaroons for authorization allows for a lot of flexibility. Aside from the customization laid out
in the section above covering the configurations, `boltwall`'s API also enables authorization schemes with 3rd parties
or as a 3rd party.

**Think of it like running your own oAuth service.**

In the same way where Google's oAuth allows a 3rd party service to sign you in to their platform by verifying
your Google account, with Boltwall, your API can act like Google, where instead of verifying your account, the
service verifies payment. An example of how this can be implemented is in the [Prism Reader](https://prismreader.app) app.
Prism Reader hosts documents provided by users. Authors of content can optionally require payment to view that content. Rather
than Prism acting as a custodian for the funds and issuing payouts, an author can run a boltwall instance, give Prism
the url of your API and a shared secret key (caveat key), and users will then **only be able to read your content once _your
server_ has acknowledged payment**!

## API Documentation

### REST API

Check out the Swagger Docs for detailed API information. This details what to expect
at the various routes provided for by `Boltwall`.

#### [REST API](https://app.swaggerhub.com/apis-docs/prism8/boltwall/1.0.0)

### API Documentation

API documentation, with details on the code and API can be found at the [documentation website](https://boltwall-org.github.io/boltwall/).
