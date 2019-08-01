# ⚡️ Boltwall ⚡️

A lightning-based paywall middlware for Nodejs + Expressjs API services. Built with Typescript.

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

## Configuration

Several configurations are required when running `boltwall`. These serve the purpose of connecting to your
lightning node and managing/signing macaroons for authentication/authorization.

### Lightning Configs

**IMPORTANT**: Boltwall will not work without these configs.

If you are connecting to a lightning node you will need the following in your project's `.env` file
or in `process.env`

Learn how to find these values [in this article](https://medium.com/@wbobeirne/making-a-lightning-web-app-part-1-4a13c82f3f78)
by Will O'Beirne. You can also try this tool by [lightning joule](https://lightningjoule.com/tools/node-info)

```
LND_TLS_CERT=[BASE64 encoded cert here]
LND_MACAROON=[hex encoded cert here]
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

## API Documentation

Check out the Swagger Docs for detailed API information:

### [Swagger API](https://app.swaggerhub.com/apis-docs/prism8/boltwall/1.0.0)
