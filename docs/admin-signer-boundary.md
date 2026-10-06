# Admin signer boundary

Privileged SDK operations must cross both the role boundary and the signer
boundary.

## Role-aware clients

Use the role-aware factories whenever possible:

- `createReadOnlyClient` accepts no keypair and exposes no asset write module.
- `createInvestorClient` requires a keypair but does not expose admin guards.
- `createIssuerClient` requires a keypair and exposes mint/transfer only.
- `createAdminClient` requires a keypair and exposes the full asset module plus
  `assertAdminAccess()`.

These surfaces are SDK guardrails. Contract-side authorization remains the
source of truth for privileged operations.

## Missing signer behavior

Direct `AegisClient` construction is intentionally more flexible and allows
the keypair to be omitted for read-only use. If a write path reaches
`requireSigner()` without a configured keypair, the SDK throws a typed
`RoleCapabilityError`:

```ts
import { AegisClient, RoleCapabilityError } from '@aegis/sdk';

try {
  await client.asset.mint(recipient, amount);
} catch (error) {
  if (
    error instanceof RoleCapabilityError &&
    error.code === 'SIGNER_REQUIRED'
  ) {
    // Configure a signer; do not retry the write as read-only.
  }
}
```

An unkeyed direct `AegisClient` is reported as `role: 'read-only'` for this
error surface because it has no signing capability.

## Wrong role versus missing signer

Treat these cases separately:

- `OPERATION_NOT_PERMITTED`: the declared role does not expose or permit the
  requested operation.
- `SIGNER_REQUIRED`: execution reached a write boundary without key material.

Neither error proves that an address is authorized on-chain. Callers must still
handle contract rejection, compliance restrictions, and network failures.

Do not log secret seeds or private key material when handling either error.
