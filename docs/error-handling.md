# Public SDK error handling

Raegis SDK exposes a stable public error shape for dashboard, API, and
integration consumers. Callers should branch on `category` and `code`
instead of parsing raw provider messages.

## Error shape

Every `AegisSdkError` exposes:

- `category`: one of `compliance`, `admin`, `asset`, `investor`,
  `soroban`, `network`, `transaction`, or `unknown`.
- `code`: a stable machine-readable identifier.
- `message`: a user-safe message suitable for logs or UI.
- `metadata`: optional approved primitive context.

The original failure may be retained as a non-enumerable `cause` for local
debugging. It is deliberately excluded from JSON serialization.

```ts
import { AegisSdkError } from '@aegis/sdk';

try {
  await client.asset.transfer(recipient, amount);
} catch (error) {
  if (error instanceof AegisSdkError) {
    console.error(error.category, error.code, error.message);
  }
}
```

## Stable categories

| Category | Representative errors |
| --- | --- |
| `compliance` | `COMPLIANCE_QUERY_FAILED` |
| `admin` | receipt validation codes such as `INVALID_AMOUNT` |
| `asset` | `ASSET_MINT_FAILED`, `ASSET_TRANSFER_FAILED` |
| `investor` | portfolio codes such as `UNAVAILABLE` |
| `soroban` | event/decode codes such as `VALUE_DECODE_FAILED` |
| `network` | `TIMEOUT`, `RPC_UNAVAILABLE`, `RATE_LIMITED` |
| `transaction` | `TRANSACTION_SIGNER_REQUIRED` |
| `unknown` | safe fallback for unclassified SDK failures |

Existing domain classes such as `NetworkFailure`, `AdminReceiptError`,
`PortfolioError`, and `EventDecodeError` remain available. They now share
the public category/code/message/metadata surface.

## Redaction contract

Raw provider error messages are not part of the public error contract. Unknown
errors must be normalized with a fixed safe message. Public metadata accepts
only primitive values, drops sensitive-key fields such as tokens, credentials,
signatures, XDR, cookies, and authorization values, and does not copy nested
objects.

Do not display or persist `cause` in dashboards. Use the public fields above
for user-facing diagnostics.

## Network failures

`NetworkFailure` keeps the existing `retryable` and
`retryAfterSeconds` properties. Consumers can continue using those fields
while also handling the common `category === 'network'` surface.

```ts
try {
  await client.runNetworkOperation(() => client.rpcServer.getLatestLedger());
} catch (error) {
  if (error instanceof AegisSdkError && error.category === 'network') {
    // Branch on error.code; never parse an upstream message.
  }
}
```
