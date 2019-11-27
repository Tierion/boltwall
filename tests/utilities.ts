import * as sinon from 'sinon'
const lnService = require('ln-service')

// getStub is a utility for generating a sinon stub for an lnService method
export function getStub(
  method: string,
  returnValue?: object | string
): sinon.SinonStub {
  if (returnValue) {
    const stub: sinon.SinonStub = sinon.stub(lnService, method)
    stub.returns(returnValue)
    return stub
  }
  return sinon.stub(lnService, method)
}
