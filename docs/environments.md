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

```typescript
import { AegisClient } from '@aegis/sdk';

const aegis = new AegisClient({
  environment: 'testnet',
  contractId: 'C_YOUR_CONTRACT_ID',
});
```

## Overriding Preset Values

You can still override the `rpcUrl` or `networkPassphrase` of a preset (e.g. to point at a
private RPC node while keeping the correct network passphrase):

```typescript
const aegis = new AegisClient({
  environment: 'testnet',
  rpcUrl: 'https://my-private-soroban-rpc.example.com',
  contractId: 'C_YOUR_CONTRACT_ID',
});
```

Overrides are validated: malformed URLs and empty passphrases throw a `ConfigValidationError`.
Plain `http://` URLs are only accepted when `environment: 'local'` — using `http://` against
`testnet` or `mainnet` throws, since it almost always indicates a misconfigured endpoint.

## The `mainnet` Preset Is Gated

The Aegis protocol has not yet been audited/deployed on Stellar mainnet, so the `mainnet`
preset throws a `ConfigValidationError` (`code: 'ENVIRONMENT_UNAVAILABLE'`) unless you opt in
explicitly:

```typescript
const aegis = new AegisClient({
  environment: 'mainnet',
  allowMainnet: true, // required while mainnet is gated
  contractId: 'C_YOUR_CONTRACT_ID',
});
```

## Fully Custom Configuration

If you don't want to use a preset at all (e.g. connecting to an unlisted network), omit
`environment` and provide `rpcUrl` and `networkPassphrase` directly, as in prior SDK versions:

```typescript
const aegis = new AegisClient({
  rpcUrl: 'https://my-custom-node.example.com',
  networkPassphrase: 'My Custom Network ; 2026',
  contractId: 'C_YOUR_CONTRACT_ID',
});
```

## Error Codes

`ConfigValidationError.code` is one of:

* `MISSING_CONFIG` - `contractId` is missing, or neither `environment` nor `rpcUrl`/`networkPassphrase` were provided.
* `ENVIRONMENT_UNAVAILABLE` - the requested environment (currently only `mainnet`) is gated and `allowMainnet` was not set to the boolean `true`.
* `INVALID_RPC_URL` - the `rpcUrl` is not a valid URL, uses an unsupported protocol, or is an insecure `http://` override outside the `local` preset. Error messages redact credentials, path, query, and fragment.
* `INVALID_NETWORK_PASSPHRASE` - the `networkPassphrase` override is empty or not a string.
* `INVALID_CONTRACT_ID` - `contractId` is not a StrKey-encoded Soroban contract ID (`C...`). Placeholders like `"C..."` are rejected.

## Safe diagnostics for support requests

When you need to share configuration with maintainers, do **not** paste the raw
config, Keypair, or RPC URL. Use the redacted diagnostic instead:

```typescript
import { buildConfigDiagnostic } from '@aegis/sdk';

console.log(JSON.stringify(buildConfigDiagnostic(config), null, 2));
// or, after construction:
console.log(JSON.stringify(client.diagnoseConfiguration(), null, 2));
```

See [Configuration diagnostics](./configuration-diagnostics.md) for the full
field list, redaction rules, and a “never paste” checklist.
