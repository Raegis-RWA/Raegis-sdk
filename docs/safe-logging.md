# Safe logging and diagnostics

Raegis SDK logs, support reports, and user-facing diagnostics must not contain
Stellar secret keys, signatures, signed transaction XDR, authorization tokens,
cookies, or private credentials.

## Use the redaction helpers

The SDK exports two defense-in-depth helpers:

- `redactSensitiveText(value)` removes common secret material from a string.
- `redactSensitiveValue(value)` returns a bounded, log-safe copy of nested
  diagnostic data and replaces sensitive field names wholesale.

```ts
import { redactSensitiveValue } from '@aegis/sdk';

const supportContext = redactSensitiveValue({
  requestId,
  error: providerError,
  transactionXdr,
});

console.error('Aegis operation failed', supportContext);
```

The redactor recognizes Stellar secret seeds, bearer tokens, credential-like
key/value pairs, long base64 transaction payloads, long hexadecimal signatures,
and sensitive object keys such as `secret`, `privateKey`, `signature`,
`authorization`, `token`, and `xdr`.

## Error boundaries

Network failures retain only a redacted copy of their original cause. Asset
mint/transfer fallback messages also pass provider text through the string
redactor before it can reach an application log.

Prefer stable SDK error codes and safe messages over raw provider errors.
Redaction is a final safety boundary, not permission to collect secrets.

## Application rules

- Never log `Keypair.secret()` or serialize signer objects.
- Never include signed transaction XDR or signatures in routine logs.
- Keep signer secrets in a protected server-side secret store or runtime
  environment; do not expose them through browser-public environment variables.
- Redact diagnostic objects before attaching them to support tickets.
- Keep request identifiers, stable error codes, retry state, and other
  non-sensitive primitives when they are useful for debugging.
- Treat unknown nested provider payloads as sensitive by default.

Tests should use fake secret-like values only.
