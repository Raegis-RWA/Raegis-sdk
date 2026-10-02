# Network failure handling

The SDK classifies raw RPC failures into a small, stable error model so
applications do not need to match provider-specific messages.

| Code                         | Retryable | Suggested action        |
| ---------------------------- | --------- | ----------------------- |
| `TIMEOUT`                    | yes       | retry                   |
| `RPC_UNAVAILABLE`            | yes       | retry with backoff      |
| `RATE_LIMITED`               | yes       | honor retry delay       |
| `INVALID_NETWORK_PASSPHRASE` | no        | check configuration     |
| `MALFORMED_RESPONSE`         | no        | inspect RPC response    |
| `UNKNOWN`                    | no        | collect safe diagnostic |

## Handle typed failures

Network operations exposed by the client boundary throw `NetworkFailure`:

```ts
import { NetworkFailure } from '@aegis/sdk';

try {
  await client.runNetworkOperation(() => fetchFromRpc());
} catch (error) {
  if (error instanceof NetworkFailure) {
    console.log(error.code);
    console.log(error.retryable);
  }
}
```

Existing SDK modules can use the same boundary. For example, compliance RPC
simulation failures are classified before they leave the module.

## Build a safe diagnostic

Use `diagnoseNetworkFailure` when a dashboard or support request needs a
serialisable summary:

```ts
const diagnostic = client.diagnoseNetworkFailure(error);

console.log(diagnostic.code);
console.log(diagnostic.action);
```

Diagnostics contain only the stable code, safe message, retryability,
recommended action, and an optional numeric retry delay. The original error,
RPC URL, response payload, request headers, tokens, and credentials are not
included. Keep raw errors in appropriately protected internal telemetry if
deeper investigation is required.

Classification is conservative. Unrecognised failures use `UNKNOWN` and are
not marked retryable.

## Related: configuration diagnostics

For a redacted summary of RPC URL, contract ID, network, feature flags, and
signer presence (without secrets), see
[Configuration diagnostics](./configuration-diagnostics.md). Paste
`diagnoseConfiguration()` / `buildConfigDiagnostic(...)` output into GitHub
issues instead of raw client or config objects.
