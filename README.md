#  Raegis SDK

The official TypeScript SDK for the **Raegis RWA Protocol**. This library provides a clean, class-based interface to interact with Raegis Soroban smart contracts on the Stellar network.

##  Installation

```bash
npm install @aegis/sdk
```

## Quickstart

Choose the least-privileged client for the job. Read-only calls do not need a
secret key. Signer-bearing clients should only be created in trusted server-side
code, with secrets loaded from runtime configuration rather than copied into source.

### Environment variables

Use public configuration for the contract/RPC endpoint and keep signer secrets
server-only:

```dotenv
RAEGIS_CONTRACT_ID=C_YOUR_CONTRACT_ID
RAEGIS_RPC_URL=https://soroban-testnet.stellar.org
# Server-side only. Never commit this value or expose it through NEXT_PUBLIC_/VITE_ variables.
RAEGIS_ADMIN_SECRET=S_YOUR_ADMIN_SECRET
```

`RAEGIS_RPC_URL` must be a complete `http://` or `https://` URL. For public
testnet use `https://soroban-testnet.stellar.org`; plain HTTP is accepted only
with the `local` environment preset.

### Keyless read-only client

```typescript
import { createReadOnlyClient } from '@aegis/sdk';

const contractId = process.env.RAEGIS_CONTRACT_ID;
if (!contractId) throw new Error('RAEGIS_CONTRACT_ID is required');

const reader = createReadOnlyClient({
  environment: 'testnet',
  contractId,
  rpcUrl: process.env.RAEGIS_RPC_URL || undefined,
});

const isApproved = await reader.compliance.checkWhitelist('G_USER_PUBLIC_KEY');
const portfolio = await reader.investor.getPortfolio('G_USER_PUBLIC_KEY');
console.log({ isApproved, portfolio });
```

No `Keypair` is accepted by `createReadOnlyClient`, so dashboards and indexers
do not need access to a signer secret.

### Signer-required admin client

```typescript
import { createAdminClient } from '@aegis/sdk';
import { Keypair } from '@stellar/stellar-sdk';

const contractId = process.env.RAEGIS_CONTRACT_ID;
const adminSecret = process.env.RAEGIS_ADMIN_SECRET;
if (!contractId) throw new Error('RAEGIS_CONTRACT_ID is required');
if (!adminSecret) throw new Error('RAEGIS_ADMIN_SECRET is required for admin calls');

const admin = createAdminClient({
  environment: 'testnet',
  contractId,
  rpcUrl: process.env.RAEGIS_RPC_URL || undefined,
  keypair: Keypair.fromSecret(adminSecret),
});

admin.assertAdminAccess();
await admin.asset.mint('G_INVESTOR', 10000);
```

Do not construct signer-bearing clients in browser bundles with raw secret keys.
The current SDK accepts `Keypair` signers; keep those keys in a trusted backend or
another protected runtime until a wallet-provider integration is available.

### Fully custom RPC configuration

When you omit an environment preset, provide both a full RPC URL and the matching
network passphrase:

```typescript
import { Networks } from '@stellar/stellar-sdk';
import { createReadOnlyClient } from '@aegis/sdk';

const reader = createReadOnlyClient({
  contractId: 'C_YOUR_CONTRACT_ID',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
});
```

See [Secure Quickstart](./docs/secure-quickstart.md) for deployment boundaries,
secret-handling guidance, and copy/paste-safe examples. A complete TypeScript
example is also available at [`examples/secure-quickstart.ts`](./examples/secure-quickstart.ts).

For role/capability details, see [Role-Aware Client Factory](./docs/role-aware-client-factory.md).

## Role Discovery & Capability Checks
Check what an address is classified as, and what it can currently attempt through the SDK.
This is a client-side convenience for UI gating, not on-chain authorization — see the
[full documentation](./docs/role-discovery.md) for important caveats.
```TypeScript
const roleResult = await aegis.role.discoverRole('G_USER_PUBLIC_KEY');
console.log('Role:', roleResult.role); // 'investor' | 'unauthorized' | 'unknown'

const capability = await aegis.role.checkCapability('G_USER_PUBLIC_KEY', 'receive_transfer');
console.log('Can receive transfer?', capability.isPermitted);
```

## Contract Event Decoder
Decode Soroban contract events into typed audit-trail models for dashboards and indexers.

```typescript
import { decodeContractEvent } from '@aegis/sdk';

const event = decodeContractEvent({
  topic: rpcEvent.topic,
  value: rpcEvent.value,
  txHash: rpcEvent.txHash,
});

if (event.kind === 'transfer') {
  console.log(event.from, event.to, event.amount);
}
```

See [Contract Event Decoder](./docs/contract-events.md) for supported topics, unknown fallback behaviour, and dashboard integration guidance.

## Testing
To run the SDK unit tests locally:

```
npm run test
```

Run the full release gate, including TypeScript compilation and browser/Node
runtime compatibility checks:

```bash
npm run check
```

### Pre-submit verification

Run all checks (lint, format, build, test, compat) in a single command before
submitting a PR:

```bash
npm run verify
```

See [Test-First Contribution Guide](docs/test-first-contribution.md) for when behavior changes need happy-path, negative-path, and no-test justification coverage.

See [Verification Command](docs/verification.md) for detailed usage and
troubleshooting guidance.

See [Runtime Compatibility](docs/runtime-compatibility.md) for the supported
environments, what the automated probes cover, and integration guidance.

For step-by-step instructions on reproducing and fixing CI check failures, see the [CI Resolution Workflow](docs/ci-resolution-workflow.md).

## Contributing
We welcome contributions! Please check our [CONTRIBUTING.md](CONTRIBUTING.md) for our branching strategy and code style guidelines.

Before submitting a PR, follow our [Test-First Contribution Guide](docs/test-first-contribution-guide.md) to understand when tests are required, what type of tests are expected per module, and how to prove your change works correctly.

Please also review our [Low-Effort PR Examples](docs/low-effort-pr-examples.md) to understand the quality standards for accepted contributions and to see examples of what to avoid (e.g., superficial changes, partial implementations, and untested code).

### Review Process
PRs submitted to this repository are reviewed against our [Pull Request Reviewer Checklist](docs/reviewer-checklist.md), which covers code implementation, unit test coverage, CI build compatibility, API reference documentation, security/compliance, and acceptance criteria.

### Acceptance Criteria Traceability
Every PR **must** include an [acceptance criteria traceability table](docs/acceptance-criteria-traceability.md) that maps SDK modules, tests, docs, and behaviour verification to each acceptance criterion from the linked issue. This makes evaluation straightforward for maintainers and GrantFox reviewers.

