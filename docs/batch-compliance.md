# Batch compliance operations

Issue #25 adds a typed SDK surface for applying whitelist and revocation
changes through the protocol's native `batch_set_compliance_status` contract
entrypoint.

## Role boundary

Use a role-aware client when possible:

- `compliance-operator` and `admin` clients expose batch compliance writes.
- `read-only`, `investor`, and `issuer` clients do not expose those methods.
- The contract remains authoritative for on-chain authorization and lifecycle
  transitions. The SDK role is a client-side capability boundary, not a
  replacement for contract authorization.

## API

```ts
import { createComplianceOperatorClient } from '@aegis/sdk';

const compliance = createComplianceOperatorClient({
  environment: 'testnet',
  contractId: 'C...',
  keypair,
});

await compliance.compliance.batchWhitelist([
  'G_FIRST...',
  'G_SECOND...',
]);

await compliance.compliance.batchRevoke([
  'G_THIRD...',
]);

await compliance.compliance.batchSetComplianceStatus([
  { user: 'G_FOURTH...', newStatus: 'Pending' },
  { user: 'G_FIFTH...', newStatus: 'Blocked' },
]);
```

All three helpers submit one Soroban host-function invocation. The SDK fetches
the signer's live account sequence, builds the transaction, asks the RPC server
to prepare it, signs the prepared transaction, and submits it.

## Atomicity and edge cases

The contract validates the batch before committing state. If any requested
transition is invalid, the contract rejects the batch rather than applying a
partial result.

The SDK performs deterministic preflight checks before RPC work:

- nonempty malformed addresses (not a valid Stellar G-account or C-contract
  identity) are rejected with `ComplianceBatchError.code === 'INVALID_ADDRESS'`
  *before* address-XDR construction or network calls;
- duplicate addresses are rejected with
  `ComplianceBatchError.code === 'DUPLICATE_ADDRESS'`;
- unsupported target states are rejected with `INVALID_STATUS`;
- structurally invalid batch input is rejected with `INVALID_BATCH`;
- an account response for another signer, or a signer/contract/network setting
  that changes while fetching the account or preparing Soroban authorization,
  is rejected with `BATCH_CONTEXT_CHANGED` before signing or submission;
- empty batches are permitted by the current contract entrypoint.

`batchWhitelist()` maps every address to `Approved`.
`batchRevoke()` maps every address to the strict `Revoked` lifecycle target.
For mixed lifecycle updates, use `batchSetComplianceStatus()`.

The SDK treats only RPC `PENDING` and `DUPLICATE` submission statuses as
accepted. It rejects `ERROR` and `TRY_AGAIN_LATER` even though Soroban RPC
also returns a transaction hash for those statuses. A hash returned by these
helpers therefore represents an accepted submission, not ledger finality;
callers that require finality should confirm the transaction through their
normal receipt/finality workflow.

## Security and compliance notes

Do not include KYC documents, sanctions evidence, legal notes, or other personal
records in a batch payload. The on-chain payload should contain only the
addresses and protocol status values required by the contract.

Protocol compliance state is application/protocol data. It must not be
presented as legal, regulatory, investment, or financial advice.
