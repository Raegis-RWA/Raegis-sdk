# Diagnostics reporter

The SDK can build a redacted diagnostics report of config and runtime state,
intended to be pasted into a support request or bug report without further
editing — though you should still read it before sharing (see
[Before you share it](#before-you-share-it)).

## What it checks

| Section     | What it reports                                                             |
| ----------- | ---------------------------------------------------------------------------- |
| `config`    | Whether `contractId`, `rpcUrl`, and `networkPassphrase` are present; which environment preset (if any) is in use; whether a signer is configured; whether the config resolves at all |
| `runtime`   | Whether the RPC endpoint is reachable; the declared client role (if a role-aware client is passed); whether a signer is configured |
| `complianceFailure` | Optional — classifies a caught error's `code` into a domain (`portfolio` \| `role` \| `config` \| `unknown`) |

## Build a report

```ts
import { buildDiagnosticsReport } from '@aegis/sdk';

const config = {
  contractId: 'C...',
  environment: 'testnet',
  keypair, // optional
};
const aegis = createReadOnlyClient(config);

const report = await buildDiagnosticsReport({
  config,       // the same object passed to the client/factory
  client: aegis, // a constructed AegisClient or role-aware client
});

console.log(JSON.stringify(report, null, 2));
```

Pass `config` even when config is missing or invalid — `diagnoseConfig`
never throws, so a broken setup still produces a report:

```ts
const report = await buildDiagnosticsReport({ config: userSuppliedConfig });
console.log(report.config.status);    // 'invalid'
console.log(report.config.errorCode); // e.g. 'MISSING_CONFIG'
```

To classify a compliance-related failure alongside the report, pass the
caught error as `complianceError`:

```ts
try {
  await aegis.compliance.checkWhitelist(address);
} catch (error) {
  const report = await buildDiagnosticsReport({ config, client: aegis, complianceError: error });
  console.log(report.complianceFailure); // { domain: 'portfolio', code: 'COMPLIANCE_ERROR', classified: true }
}
```

The individual builders (`diagnoseConfig`, `buildRuntimeDiagnostics`,
`classifyComplianceFailure`) are also exported directly if you only need one
section.

## What is never included

- **Private keys, secret seeds, or the `Keypair` object itself.** Only
  `signerConfigured: boolean` is reported — existence, not content.
- **Stellar addresses** (investor addresses, signer public keys) — these
  identify an account/person and are treated as identity data, not config.
- **RPC URL query strings or fragments.** Only `origin` and `pathname` are
  reported; a URL like `https://rpc.example.com/soroban?apiKey=...` is
  reported as `{ origin: 'https://rpc.example.com', path: '/soroban' }`.
- **Raw error messages or causes.** Failure classification reads only an
  error's closed `code` field (e.g. `COMPLIANCE_ERROR`, `RPC_UNAVAILABLE`) —
  never `.message` or `.cause`, which elsewhere in the SDK may interpolate
  raw RPC responses or addresses.
- **Any config field the reporter doesn't explicitly know about.** The
  reporter is built as an allowlist: it reads named fields one at a time and
  assembles the result from them. A field it has no code for — a custom
  credential someone added to their config object, for example — is absent
  from the report by default, not present until someone remembers to hide
  it.

## Before you share it

This reporter is designed to be safe by default, but no automated redaction
is a substitute for a human check. Before pasting a report into a GitHub
issue, support ticket, or chat: read it once. If your config object had
anything unusual attached to it, or if you're unsure, don't share it until
you've confirmed the output looks right.
