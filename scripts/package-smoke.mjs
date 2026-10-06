import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sdk = require('@aegis/sdk');

assert.equal(typeof sdk.AegisClient, 'function');
assert.equal(typeof sdk.ConfigValidationError, 'function');
assert.equal(typeof sdk.RoleCapabilityError, 'function');

const contractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const client = new sdk.AegisClient({ environment: 'testnet', contractId });

assert.equal(client.contractId, contractId);
assert.ok(client.rpcServer);
assert.ok(client.compliance);

let invalidConfigError;
try {
  new sdk.AegisClient({ contractId });
} catch (error) {
  invalidConfigError = error;
}

assert.ok(invalidConfigError instanceof sdk.ConfigValidationError);
assert.equal(invalidConfigError.code, 'MISSING_CONFIG');

console.log('package smoke: public imports, client init, compliance access, invalid config, and error exports OK');
