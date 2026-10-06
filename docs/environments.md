# Aegis SDK - Environment Presets

`AegisClient` supports typed environment presets so consumers don't need to manually
copy RPC URLs and network passphrases. Each preset bundles a known-good `rpcUrl` and
`networkPassphrase` for a given network.

## Available Presets

| Environment | `rpcUrl` | `networkPassphrase` | Available by default |
| :--- | :--- | :--- | :--- |
| `testnet` | `https://soroban-testnet.stellar.org` | `Networks.TESTNET` | Yes |
| `local` | `http://localhost:8000/soroban/rpc` | `Networks.STANDALONE` | Yes |
| `mainnet` | `https://soroban-rpc.mainnet.stellar.org` | `Networks.PUBLIC` | No (gated) |

Import `AEGIS_ENVIRONMENTS` to inspect a preset directly:

```typescript
import { AEGIS_ENVIRONMENTS } from '@aegis/sdk';

console.log(AEGIS_ENVIRONMENTS.testnet.rpcUrl);
```

## Using a Preset

`testnet` is the recommended development preset. It is not selected implicitly:
name the environment so configuration cannot silently drift between networks.

The examples use `CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4` as a valid-format contract StrKey only; replace it
with the contract deployed in the selected environment.

```typescript
import { AegisClient } from '@aegis/sdk';

const aegis = new AegisClient({
  environment: 'testnet',
  contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
});
```

## Overriding Preset Values

You can still override the `rpcUrl` or `networkPassphrase` of a preset (e.g. to point at a
private RPC node while keeping the correct network passphrase):

```typescript
const aegis = new AegisClient({
  environment: 'testnet',
  rpcUrl: 'https://my-private-soroban-rpc.example.com',
  contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
});
```

Overrides are validated: malformed URLs and empty passphrases throw a `ConfigValidationError`.
Plain `http://` URLs are only accepted when `environment: 'local'` — using `http://` against
`testnet` or `mainnet` throws, since it almost always indicates a misconfigured endpoint.

## Named Contract Registry

When an application needs stable logical names instead of manually switching contract IDs,
define an environment-scoped registry and select one entry by name:

```typescript
import { AegisClient, defineContractRegistry } from '@aegis/sdk';

const contracts = defineContractRegistry({
  testnet: {
    protocol: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
  },
  local: {
    protocol: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
  },
});

const aegis = new AegisClient({
  environment: 'testnet',
  contractRegistry: contracts,
  contractName: 'protocol',
});
```

A registry lookup is allowed only with a named environment. The SDK validates all entries
passed through `defineContractRegistry`, never falls back to a contract registered for a
different environment, and rejects ambiguous configuration that supplies both `contractId`
and `contractRegistry`/`contractName`.

Direct `contractId` configuration remains supported for existing callers.

## The `mainnet` Preset Is Gated

The Aegis protocol has not yet been audited/deployed on Stellar mainnet, so the `mainnet`
preset throws a `ConfigValidationError` (`code: 'ENVIRONMENT_UNAVAILABLE'`) unless you opt in
explicitly:

```typescript
const aegis = new AegisClient({
  environment: 'mainnet',
  allowMainnet: true, // required while mainnet is gated
  contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
});
```

## Fully Custom Configuration

If you don't want to use a preset at all (e.g. connecting to an unlisted network), omit
`environment` and provide `rpcUrl` and `networkPassphrase` directly, as in prior SDK versions:

```typescript
const aegis = new AegisClient({
  rpcUrl: 'https://my-custom-node.example.com',
  networkPassphrase: 'My Custom Network ; 2026',
  contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
});
```

## Error Codes

`ConfigValidationError.code` is one of:

* `MISSING_CONFIG` - required network or contract selection is missing, ambiguous, or a named registry entry does not exist for the selected environment.
* `INVALID_CONTRACT_ID` - a direct or registered contract ID is not a valid Stellar `C...` contract StrKey.
* `ENVIRONMENT_UNAVAILABLE` - the requested environment (currently only `mainnet`) is gated and `allowMainnet` was not set.
* `INVALID_RPC_URL` - the `rpcUrl` is not a valid URL, uses an unsupported protocol, or is an insecure `http://` override outside the `local` preset.
* `INVALID_NETWORK_PASSPHRASE` - the `networkPassphrase` override is empty or not a string.
