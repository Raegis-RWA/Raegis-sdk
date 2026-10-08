#  Raegis SDK

The official TypeScript SDK for the **Raegis RWA Protocol**. This library provides a clean, class-based interface to interact with Raegis Soroban smart contracts on the Stellar network.

##  Installation

```bash
npm install @aegis/sdk
```

## Quickstart

Use the role-aware factory to construct a client with explicit capability
intent. The returned object only exposes modules and operations that are
appropriate for the declared role.

```typescript
import {
  createReadOnlyClient,
  createInvestorClient,
  createIssuerClient,
  createAdminClient,
} from '@aegis/sdk';
import { Keypair } from '@stellar/stellar-sdk';

// Read-only — no keypair needed. Suitable for dashboards and indexers.
const reader = createReadOnlyClient({
  environment: 'testnet',
  contractId: 'C_YOUR_CONTRACT_ID',
});
const isApproved = await reader.compliance.checkWhitelist('G_USER_PUBLIC_KEY');
const portfolio  = await reader.investor.getPortfolio('G_USER_PUBLIC_KEY');

// Investor — keypair required. Transfer capability only.
const investor = createInvestorClient({
  environment: 'testnet',
  contractId: 'C_YOUR_CONTRACT_ID',
  keypair: Keypair.fromSecret('S_INVESTOR_SECRET'),
});
await investor.asset.transfer('G_RECIPIENT', 100);

// Issuer — keypair required. Adds asset minting.
const issuer = createIssuerClient({
  environment: 'testnet',
  contractId: 'C_YOUR_CONTRACT_ID',
  keypair: Keypair.fromSecret('S_ISSUER_SECRET'),
});
await issuer.asset.mint('G_INVESTOR', 5000);

// Admin — keypair required. Full access.
const admin = createAdminClient({
  environment: 'testnet',
  contractId: 'C_YOUR_CONTRACT_ID',
  keypair: Keypair.fromSecret('S_ADMIN_SECRET'),
});
admin.assertAdminAccess(); // explicit guard before privileged call
await admin.asset.mint('G_INVESTOR', 10000);
```

See [Role-Aware Client Factory](./docs/role-aware-client-factory.md) for the
full capability matrix, `compliance-operator` usage, error handling, and
security notes.

## Batch Compliance Operations

Compliance-operator and admin role clients can submit atomic whitelist,
revocation, or mixed lifecycle batches through the contract's native
`batch_set_compliance_status` entrypoint. The SDK prepares the single Soroban
invocation before signing and submission; the contract remains authoritative
for lifecycle and authorization checks.

`batchRevoke()` uses the strict lifecycle transition to `Revoked`, so a
batch is rejected rather than partially applied when any row is invalid.
Duplicate addresses and invalid target states are rejected before RPC work.

Do not place KYC documents, sanctions evidence, legal notes, or other personal
data on-chain. The batch payload should contain only addresses and resulting
protocol status values. Protocol status is not legal or financial advice.

See [Batch Compliance Operations](./docs/batch-compliance.md) for the role
boundary, mixed-status API, atomicity guarantees, failure semantics, and
security guidance.

For direct `AegisClient` construction (advanced / custom setups):

```typescript
import { AegisClient } from '@aegis/sdk';

const aegis = new AegisClient({
  environment: 'testnet',
  contractId: 'C_YOUR_CONTRACT_ID',
  keypair: Keypair.fromSecret('S...'), // optional for read-only
});
```

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

