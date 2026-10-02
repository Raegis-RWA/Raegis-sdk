# Configuration diagnostics

The SDK can emit a **redacted configuration summary** that is safe to paste into
GitHub support requests. Use it instead of logging the raw `AegisClient`,
`Keypair`, RPC server, or config object.

## Why this exists

Diagnostics are useful when a dashboard fails to start or a contributor needs
help reproducing a network issue. Raw configuration is not safe to share:

| Value | Risk if pasted into GitHub |
| --- | --- |
| RPC URL with `user:password@` | Credential leak |
| RPC URL path / query / fragment | Managed providers often put API keys here |
| `Keypair` / `_secretSeed` / `secret()` | Full account takeover |
| Network passphrase of a private network | Identifies an unpublished deployment |
| Full contract ID of an unannounced deploy | May reveal private deployments |

## Quick start

```typescript
import { AegisClient, buildConfigDiagnostic } from '@aegis/sdk';

// Preferred when the client constructed successfully:
const client = new AegisClient({
  environment: 'testnet',
  contractId: 'C_YOUR_CONTRACT_ID',
});
const diagnostic = client.diagnoseConfiguration();

// Preferred when construction itself fails — still get a typed report:
const failed = buildConfigDiagnostic({
  environment: 'mainnet',
  contractId: 'C...',
  rpcUrl: 'https://user:secret@rpc.example.com/v1/key?token=abc',
});

console.log(JSON.stringify(failed, null, 2));
```

Example (safe) output:

```json
{
  "status": "error",
  "ready": false,
  "environment": "mainnet",
  "rpc": {
    "display": "https://<redacted>@rpc.example.com/<redacted>?<redacted>",
    "protocol": "https",
    "secure": true,
    "loopback": false,
    "hasCredentials": true,
    "hasSensitiveSegments": true
  },
  "contractId": "<invalid-contract-id>",
  "network": "public",
  "featureFlags": {
    "allowMainnet": false,
    "environmentAvailable": false
  },
  "signer": {
    "present": false,
    "type": "none"
  },
  "issues": [
    {
      "code": "ENVIRONMENT_UNAVAILABLE",
      "field": "environment",
      "severity": "error",
      "message": "The selected environment is gated and was not explicitly opted into."
    },
    {
      "code": "INVALID_CONTRACT_ID",
      "field": "contractId",
      "severity": "error",
      "message": "The contract ID is not a valid StrKey-encoded Soroban contract ID."
    },
    {
      "code": "RPC_URL_HAS_CREDENTIALS",
      "field": "rpcUrl",
      "severity": "warning",
      "message": "The RPC URL embeds credentials. Prefer header-based auth and never paste the raw URL."
    },
    {
      "code": "RPC_URL_HAS_SENSITIVE_SEGMENTS",
      "field": "rpcUrl",
      "severity": "warning",
      "message": "The RPC URL includes a path, query, or fragment that may contain an API key."
    }
  ]
}
```

## What is included

| Field | Contents |
| --- | --- |
| `status` | `ok` \| `warning` \| `error` |
| `ready` | `true` when there are no error-severity issues |
| `environment` | Preset name, or `<none>` / `<missing>` |
| `rpc.display` | Host-only URL with credentials/path/query/fragment redacted |
| `rpc.protocol` / `secure` / `loopback` | Transport shape without secrets |
| `contractId` | Masked `CAAA...BSC4`, or `<invalid-contract-id>` |
| `network` | Well-known name (`testnet`, `public`, …) or `custom` |
| `featureFlags.allowMainnet` | Whether mainnet was explicitly opted into |
| `featureFlags.environmentAvailable` | Whether the preset is marked available |
| `signer.present` / `signer.type` | Signer presence only (`keypair` or `none`) |
| `issues[]` | Typed codes, field names, severities, and fixed messages |

## What is never included

Do **not** paste any of the following into GitHub, Slack, or public docs:

* Raw `rpcUrl` strings
* `Keypair` objects, secret seeds, or `keypair.secret()` output
* `client.rpcServer` / HTTP auth headers
* Full private-network passphrases
* Arbitrary `JSON.stringify(client)` or `JSON.stringify(config)` output

`buildConfigDiagnostic` and `diagnoseConfiguration` are allowlisted. If a field
is not listed above, it is intentionally omitted.

## Validation hardening

`resolveClientConfig` (and therefore `new AegisClient(...)`) now:

* Validates `contractId` with `StrKey.isValidContract` (`INVALID_CONTRACT_ID`)
* Requires `allowMainnet === true` (truthy strings like `"yes"` are rejected)
* Redacts RPC URLs inside `ConfigValidationError` messages

Diagnostics collect **all** independent issues instead of stopping at the first
fail-fast exception, which is why `buildConfigDiagnostic` is preferred when
construction fails.

## Safe sharing checklist

1. Call `client.diagnoseConfiguration()` or `buildConfigDiagnostic(config)`.
2. Paste only the JSON produced by that call.
3. Optionally attach `client.diagnoseNetworkFailure(error)` for RPC failures —
   see [Network failures](./network-failures.md).
4. Never attach screenshots of `.env` files, wallet exports, or browser
   Application tabs that show secrets.

## Related docs

* [Environment presets](./environments.md)
* [Network failures](./network-failures.md)
* [API reference](./api-reference.md)
