# SDK Diagnostics Report

The SDK diagnostics report is a deterministic, redaction-first snapshot for
maintainers and integrators debugging configuration and network failures. It is
safe to attach to a support issue when generated through the SDK API.

```ts
const report = client.buildDiagnosticsReport({
  recentErrors: [lastSdkError],
});

console.log(JSON.stringify(report, null, 2));
```

## What the report includes

- **Environment** — the configured preset name or `custom`.
- **RPC readiness** — whether an endpoint is configured, whether it uses HTTP or
  HTTPS, and whether it exactly matches the selected preset endpoint.
- **Network target** — `testnet`, `local`, `mainnet`, or `custom`, inferred
  from the configured network passphrase without serializing that passphrase.
- **Contract configuration** — only a boolean indicating that a contract ID is
  present. The full contract ID is intentionally omitted.
- **Signer readiness** — a boolean indicating whether the client was constructed
  with a signer. No key material is included.
- **Network failure state** — `degraded` only when a recent typed
  `NetworkFailure` is supplied; otherwise `not-checked`.
- **Compliance module readiness** — whether the module exists on the client.
  Protocol whitelist state is deliberately `not-checked` and legal status is
  always `not-assessed`.
- **Recent errors** — at most five sanitized typed errors. Raw messages, causes,
  response bodies, headers, URLs, and unknown exception values are omitted.

## Redaction boundary

The report never serializes raw RPC URLs, network passphrases, full contract
identifiers, signer material, raw error messages or causes, or RPC response
payloads and headers.

Known network and configuration errors are converted to stable codes and
predefined safe messages. Unknown errors become a generic `UNKNOWN` entry.

The underlying client still retains its normal configuration in memory so it
can operate. The redaction boundary applies to the report object, not to an
arbitrary dump of the client instance. Do not attach a serialized client or raw
exception object to a support request.

## Network status semantics

`network.status` is intentionally conservative:

- `not-checked` — no recent typed network failure was supplied. This does not
  assert that the RPC service is healthy.
- `degraded` — a recent typed `NetworkFailure` was supplied; the report embeds
  the safe network diagnostic and recovery action.

Generating a report performs no new RPC call. That keeps support diagnostics
deterministic and prevents a reporting operation from changing the failure being
investigated.

## Compliance boundary

`compliance.module: "available"` means only that the SDK client constructed its
`ComplianceModule`. It does not mean an investor is approved, protocol KYC is
complete, a transfer is legally permitted, or the deployed contract would
authorize an operation.

Use the protocol's own compliance read paths for protocol state and qualified
counsel for legal or regulatory conclusions.

## Support workflow

1. Capture the typed SDK error returned by the failing operation.
2. Build the report with that error in `recentErrors`.
3. Review the serialized report before sharing it.
4. Attach only the diagnostics report and the smallest reproduction steps needed
   to explain the problem.
5. Keep raw RPC payloads, headers, credentials, key material, and unrelated
   wallet data out of public issues.

## Standalone builder

Advanced integrations that do not hold an `AegisClient` instance can use
`buildSdkDiagnosticsReport(input, options)`. It accepts the same raw
configuration values only to derive coarse state; those values are never copied
into the returned report. Normal applications should prefer
`client.buildDiagnosticsReport(...)` so the snapshot reflects the already
validated client configuration.
