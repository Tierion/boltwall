[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)
[![Build Status](https://travis-ci.com/Tierion/boltwall.svg?branch=master)](https://travis-ci.com/Tierion/boltwall)
[![Coverage Status](https://coveralls.io/repos/github/Tierion/boltwall/badge.svg)](https://coveralls.io/github/Tierion/boltwall)

# ⚡️ Boltwall ⚡️

Bitcoin Lightning paywall and authentication using LSATs. Charge to access your API without requiring user accounts, API keys, credit cards, or storing any user data. All you need is a lightning node and a single line of code in your server. Built with [LND](https://lightning.engineering/), Nodejs, and Typescript.

All you need to put a paywall in front of a route on your server is this one line of code:

```js
app.use(boltwall())
```

- [⚡️ Boltwall ⚡️](#%e2%9a%a1%ef%b8%8f-boltwall-%e2%9a%a1%ef%b8%8f)
    - [Supported Features](#supported-features)
  - [System Requirements](#system-requirements)
  - [Usage](#usage)
  - [Test the API](#test-the-api)
  - [Required Environment Variables](#required-environment-variables)
    - [Lightning Configs](#lightning-configs)
  - [What is an LSAT](#what-is-an-lsat)
    - [Authentication Flow](#authentication-flow)
    - [Custom Authorization w/ Macaroons](#custom-authorization-w-macaroons)
    - [Pre-built Configs](#pre-built-configs)
      - [**`TIME_CAVEAT_CONFIGS`**](#timecaveatconfigs)
      - [**`ORIGIN_CAVEAT_CONFIGS`**](#origincaveatconfigs)
  - [HODL Invoices](#hodl-invoices)
    - [Example Implementation and Access Flow](#example-implementation-and-access-flow)
    - [Generation](#generation)
    - [Authorization Flows](#authorization-flows)
    - [Making the Payment](#making-the-payment)
    - [A `held` Invoice is a Paid Invoice](#a-held-invoice-is-a-paid-invoice)
  - [3rd Party Authentication](#3rd-party-authentication)
    - [Usage](#usage-1)
      - [Authentication flow](#authentication-flow-1)
  - [Documentation](#documentation)
    - [Custom Configs & Caveats](#custom-configs--caveats)
    - [REST API](#rest-api)
    - [Full API Documentation](#full-api-documentation)

### Supported Features

- New LSAT protocol for authentication
- Protect routes in your own API by using as a middleware
- Custom attenuation via macaroons
- Optional configurations available for time and IP restricted access
- [HODL Invoices](#hodl-invoices)
- oAuth-like authorization for compatible 3rd party services (Coming soon)

## System Requirements

- Node > 11.10.0
- npm > 6.9.0

Your project must also use `Expressjs` 4.x as well as the `cors` and `body-parser` middleware.
Restify is also supported although not broadly tested.

## Usage

To use as a middleware in an existing server, just install from npm into your project,
and use before any routes that you want protected.

> **NOTE:** Order matters with middleware. Any routes that appear _after_ boltwall will require
> proper authentication in order to access. Boltwall can be used within routes to keep it isolated
> from other routes you want to remain free.

An example project can be seen in `src/server.ts`, which can be run with `yarn start`
(after [configuration](#required-environment-variables)).

A very simple server file, with no special configurations, could look like this:

```javascript
const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')

const { boltwall } = require('boltwall')

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

// this will require payment and proper lsat to access
app.get('/protected', (_req, res) =>
  res.json({
    message:
      'Protected route! This message will only be returned if an invoice has been paid',
  })
)

app.listen(5000, () => console.log('listening on port 5000!'))
```

## Test the API

**Running the example server**

To run the test server, clone the repo, add appropriate [configs](#required-environment-variables)
to a local `.env` file, and from the directory run:

```bash
$ yarn install
$ yarn start
```

This runs the server located in `/src/server.ts`, which you can edit to test the middleware's
behavior.

Once the server is running, you can test the API:

1. `GET http://localhost:5000/node` to get connection information about your lightning node
   (no payment required).

2. `GET http://localhost:5000/protected?amount=[amount]` will return a `402` error for payment required. An LSAT challenge
   will be available in the returned `WWW-Authenticate` header. Decode LSAT to get full invoice information. Amount in query string will be used in invoice generation unless below
   minAmount configured in boltwall. If no amount is set, then minAmount will be used.

3. `GET http://localhost:5000/protected` with appropriate LSAT in Authorization header (including
   preimage) will return the response from the protected route

4. `POST http://localhost:5000/invoice` with the following JSON body to get a new invoice (there
   is no relation to any lsat and so cannot be used for authentication): `{ "amount": 30 }`

5. `GET http://localhost:5000/invoice` with the appropriate LSAT in Authorization header (even with missing
   payment hash) will return the status of the associated invoice

Read more about the REST API in the [documentation](#documentation).

## Required Environment Variables

Several environment variables are required when running `boltwall`.
These serve the purpose of connecting to your lightning node and managing/signing macaroons
for authentication/authorization.

### Lightning Configs

**Lightning configs (either lnd connection info _or_ OpenNode API key depending on connection type)
are required environment variables**

If you are connecting to a lightning node you will need the following in your project's `.env` file
or on the `process.env` object

Learn how to find these values for your node
[in this article](https://medium.com/@wbobeirne/making-a-lightning-web-app-part-1-4a13c82f3f78)
by Will O'Beirne. You can also try this tool by [lightning joule](https://lightningjoule.com/tools/node-info).

```
LND_TLS_CERT=[BASE64 or HEX encoded cert here]
LND_MACAROON=[BASE64 or HEX encoded cert here]
LND_SOCKET=[address of node here, e.g. localhost:10006]
```

Alternatively, if you are using OpenNode for managing payments,
[create an OpenNode account](https://dev.opennode.co) (currently testnet only),
generate an API key and save it as:

```
OPEN_NODE_KEY=[API KEY HERE]
```

If you have both the lnd configs and OpenNode, _lnd will take precedence_.

A `SESSION_SECRET` can also be set but will be generated with a secure number of random bytes if
none is provided.

```
SESSION_SECRET=[RANDOM STRING MINIMUM 32 BYTES IN LENGTH]
```

If you don't set this yourself, then the secret is not persisted between server restarts. This means
that LSATs generated before the restart are no longer valid _after_ restart since the signing key
used to generate (and validate) macaroons will have changed.

## What is an LSAT

LSATs are a new authentication scheme first introduced by Lightning Labs CTO Olaoluwa Osuntokun. Slides from
the original presentation can be found [here](https://docs.google.com/presentation/d/1QSm8tQs35-ZGf7a7a2pvFlSduH3mzvMgQaf-06Jjaow/edit#slide=id.p).

The idea is to create a standardized specification format for dealing with _payment-based_ authentication,
in contrast to the username/password (a.k.a. "Basic Authentication") and token based (most commonly used in
OAuth constructions) authentication schemes in common use today. By combining a
cryptographically verifiable proof of payment from a lightning invoice with its corresponding
preimage and a [macaroon](http://hackingdistributed.com/2014/05/16/macaroons-are-better-than-cookies/),
the idea is that a new, flexible, and private authorization protocol can be developed.

Checkout `lsat-js` for a separate utility library available for manipulating, interacting
with, and validating LSATs. Available on npm: https://www.npmjs.com/package/lsat-js

### Authentication Flow

There are three main stages to the authentication flow with LSATS:

1. When a request is made to protected route, a `402 Payment Required` response is sent back.
   This includes a `WWW-Authenticate` header with an LSAT. This is an encoded "challenge"
   that includes a macaroon (read more below to learn how these work) and an invoice value.

1. The consumer of the API extracts and pays the invoice from the LSAT. After payment, a payment preimage
   should be revealed that acts as a cryptographically verifiable proof of payment.

1. The consumer can now compose their LSAT using the preimage and the macaroon from the original challenge
   and put it in the `Authorization` http header like so: `LSAT [macaroon]:[preimage]`

Since the payment hash associated with the paid invoice could _only_ have been generated using the preimage
(also known as a "secret") and that preimage would be impossible to guess and so could only have been retrieved
after paying the invoice, this serves as proof of payment and the server can verify that the request is authorized.

### Custom Authorization w/ Macaroons

Boltwall allows for flexible authorization schemes. Effectively, this means that a server
that is implementing Boltwall to protect content can dictate factors such as how long
authorization is valid for based off of a payment or restrict access to only the originating IP.

As an example, the configuration in the example file `src/server.ts`, sets up authorization that
is valid for 1 second for every satoshi paid in the invoice.
So if a user pays a 30 satoshi invoice, then access is allowed for 30 seconds.

The config object should be passed to `boltwall` on initialization. e.g. `app.use(boltwall(myConfig))`, where `myConfig` provides the relevant properties. Currently, the config supports
four properties: `getCaveats`(func), `caveatSatisfiers` (func), `getInvoiceDescription`, and `minAmount`.

More information on the configs can be found in the
[API Documentation](https://Tierion.github.io/boltwall/interfaces/_src_typings_configs_d_.boltwallconfig.html).

### Pre-built Configs

Boltwall exposes some default configs you can use in your own server. Simply import
them from the module and then pass them into boltwall when `use`ing it in your express
server.

```javascript
import { boltwall, TIME_CAVEAT_CONFIGS } from 'boltwall'

// ...  rest of your server code

app.use(boltwall(TIME_CAVEAT_CONFIGS))

// ... protected routes and any other server code
```

Since `getCaveats` and `caveatSatisfiers` can also accept an array of functions,
you can also combine configs to add multiple caveats and their corresponding satisfiers.

Currently Boltwall provides the following configs:

#### **`TIME_CAVEAT_CONFIGS`**

This creates a restriction that any authorization is only valid for a number of seconds
equal to the number of satoshis paid.

#### **`ORIGIN_CAVEAT_CONFIGS`**

This creates a restriction that any authorization is only valid from the IP that originally
made the request for access.

## HODL Invoices

HODL invoices are a unique payment construction in lightning that allow a payee
to simulate escrow-type situations or fidelity bonds in a lightning payment.

In a nutshell, a HODL invoice allows you to create a payment that does not
automatically settle, but instead is "held" until someone (either the owner of the node
or, more likely, some other party that is prepared to release the payment based
on some conditions) reveals the preimage that the invoice is locked to. If
this secret is never revealed, the `held` payment is eventually refunded back to the
original payer.
You can read more about how they are constructed and examples of potential use-cases
[here](https://github.com/lightningnetwork/lnd/pull/2022).

**NOTE:** Your lightning node MUST have the `invoicesrpc` flag enabled in order
to support hodl invoices.

Boltwall includes basic support for creating and settling hodl invoices (cancelling
must be done directly by the owner of the node and is not exposed via the Boltwall
API at this time to avoid exposing potential [double-spend](https://en.wikipedia.org/wiki/Double-spending)-like risks).

### Example Implementation and Access Flow

To enable a paywall that uses hodl invoices instead of normal invoices, simply initialize
the middleware with `hodl` set to true in the config:

```js
app.use((req, res, next) => {
  if (req.path === 'protected' && !req.body.paymentHash) {
    // Note: you'll probably want to save the secret somehow
    // otherwise the hodl invoice can't be redeemed
    const secret = crypto.randomBytes(32)
    const paymentHash = crypto
        .createHash('sha256')
        .update(secret)
        .digest()
    req.body.paymentHash = paymentHash
  }
  next()
})
app.use(boltwall{ hodl: true })
// all routes after this will require payment to a hodl invoice
app.get('/protected', (req, res) => res.send('This route is protected'))
```

1. The initial request for the route _requires_ a paymentHash in the request body. This is
   how a hodl invoice is created. The payment hash can either be provided by the client
   or added in a middleware before `boltwall` is initialized (as in the example above).
2. Boltwall will return an LSAT challenge in the `WWW-Authenticate` header as normal
3. The client should pay the invoice.
4. Since this is a hodl invoice, the client won't get a `preimage` until the invoice settles.
   How this is managed is up to the implementor and the architecture of the application. If the
   server is storing the secret, or retrieving it by some other means (such as with split payments),
   it can add it to the LSAT when it wants to invalidate _future_ requests.
5. Once the invoice settles and has a status of `paid` (instead of `held`) the LSAT is considered
   expired and future requests will be `Unauthorized`

### Generation

The source of the pre-image and payment hash can be whatever you want. One common
construction is for the pair to be tied to another invoice, which makes it so that the HODL
invoice can't settle until another invoice settles and reveals its own preimage.

### Authorization Flows

All authorization mechanisms (i.e. via macaroons) are preserved when using HODL invoices.
The root macaroon is created and added to the LSAT when creating the invoice as normal.
If time caveats are enabled, then this will timeout based on the amount paid. Custom
configurations can be devised and passed in to boltwall upon initialization.

### Making the Payment

When making the payment with your lightning client, it may look like the payment
is stuck or is hanging. This is normal and is the result of a client having no way
to know whether an invoice is normal or HODL so it is waiting for the invoice to settle.
This won't happen for a HODL invoice until you settle it with the preimage.

### A `held` Invoice is a Paid Invoice

What this means is that the paywall considers the invoice paid and "unlocks"
the protected content, by providing the discharge macaroon even though your node
technically may not have settled the payment yet and so doesn't have access to the funds.

Boltwall's default behavior for handling HODL LSAT requests is to settle an invoice when
the secret is provided in the LSAT _after_ the request has been authorized. This means
that a request with the secret will be the _last_ request for that LSAT since afterwards
it will be `paid` and therefore "expired".

## 3rd Party Authentication

### Usage

To enable, simply set `oauth` to true when initializing middleware:

```javascript
import { boltwall } from 'boltwall'

// ...  rest of your server code

app.use(boltwall({ oauth: true }))

// ... protected routes and any other server code
```

This will add a requirement for requests to protected routes that an `auth_uri` be indicated
in the request query. This indicates the 3rd party server that will process and confirm payments,
ultimately signing a "challenge" to enable the holder of the corresponding LSAT access to the protected route.

Both the server processing requests for protected routes and the authorizing server signing the challenge
must have `oauth` enabled.

**NOTE:**
Boltwall's upgrade to support LSATs _removed_ previous support for 3rd party caveats
to enable OAuth-like constructions. A coordination step around a shared key was used to verify
3rd party caveats and corresponding discharge macaroons. Since Boltwall v5, a new protocol
is used that no longer requires any coordination to support 3rd party authentication.

The use of macaroons for authorization allows for a lot of flexibility. Aside from the customization laid out
in the section above covering the configurations, `boltwall`'s API also enables authorization schemes
with 3rd parties or as a 3rd party itself.

**Think of it like running your own oAuth service.**

In the same way that Google's oAuth allows a 3rd party service to sign you in to their platform by verifying
your Google account, with Boltwall, your API can act like Google, where instead of verifying your account, the
service verifies payment. An example of how this can be implemented is in the [Prism Reader](https://prismreader.app) app.
Prism Reader hosts documents provided by users. Authors of content can optionally require payment to view that content. Rather
than Prism acting as a custodian for the funds and issuing payouts, an author can run a boltwall instance, give Prism
the url of your API, and users will then **only be able to read your content once _your
server_ has acknowledged payment**!

#### Authentication flow

The below image should give an idea of the authentication flow between the boltwall api, a lightning node,
a 3rd party app requiring authorization, and the client paying for access.
![boltwal architecture diagram](https://raw.githubusercontent.com/Tierion/boltwall/master/boltwall-diagram.png 'diagram')

## Documentation

### Custom Configs & Caveats

Boltwall supports custom configurations that can be set on initialization.
One important part of this is the ability to create custom macaroon caveats and the satisfiers
your server will use to evaluate their validity. The `TIME` and `ORIGIN` configs described above
are just two examples of these. Note that each caveat must have a corresponding satisfier
in order for a macaroon to validate.

The properties that can be passed (none are required) to the boltwall config object are:

- `getCaveats`: function or array of functions to generate caveats attached to LSAT macaroons
- `caveatSatisfiers`- (required if getCaveats is set) Satisfier object or array of Satisfiers
  (see full documentation for more details on writing your own satisfiers) for evaluating
  caveats on a macaroon.
- `getInvoiceDescription` - an optional function that returns a string to be used in the invoice description
- `minAmount` - minimum amount to create invoices with if none is passed in request body
- `hodl`- (optional, false by default) boolean, true to enable a hodl paywall.
- `oauth`- (optional, false by default) boolean, true to enable 3rd party authentication.

More indepth documentation for these properties can be found in the [docs](https://Tierion.github.io/boltwall/interfaces/_src_typings_configs_d_.boltwallconfig.html)

### REST API

Check out the Swagger Docs for detailed API information. This details what to expect
at the various routes provided for by `Boltwall`.

**[REST API](https://app.swaggerhub.com/apis-docs/boltwall/boltwall/2.0.0-beta-oas3)**

### Full API Documentation

API documentation, with details on the code, API, and Typescript definitions
can be found at the [documentation website](https://Tierion.github.io/boltwall/).
