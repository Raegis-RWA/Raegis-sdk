# Role-Aware Client Factory

The Aegis SDK provides a set of factory functions that construct clients with
**explicit, statically-typed role capabilities**. Instead of creating a single
`AegisClient` and relying on runtime guards, consumers declare their intent at
construction time and receive a narrowed interface that only exposes the
operations their role permits.

---

## Why role-aware clients?

A plain `AegisClient` exposes every module to every caller. A read-only
dashboard script and an admin automation tool are constructed identically, which
makes it easy to accidentally call a privileged write operation from a context
that should never sign transactions.

The role-aware factory addresses this by:

- Accepting a keypair **only** for roles that require one.
- Returning a typed surface where **unpermitted methods simply do not exist**.
- Providing a runtime `assertCapability()` guard for dynamic dispatch and
  explicit `.client` escape-hatch usage, plus the convenience guards
  `assertAdminAccess()` and `assertWhitelistAccess()`. Denied checks throw a
  typed `RoleCapabilityError`.

---

## Roles and capability matrix

| Role                  | Read | Sign | Transfer | Mint | Manage whitelist | Admin ops |
|-----------------------|------|------|----------|------|------------------|-----------|
| `read-only`           | ✓    |      |          |      |                  |           |
| `investor`            | ✓    | ✓    | ✓        |      |                  |           |
| `compliance-operator` | ✓    | ✓    | ✓        |      | ✓                |           |
| `issuer`              | ✓    | ✓    | ✓        | ✓    |                  |           |
| `admin`               | ✓    | ✓    | ✓        | ✓    | ✓                | ✓         |

---

## Runtime capability guard

Every role-aware client exposes `assertCapability(flag, operation?)`. Use it
when the operation is selected dynamically or when code intentionally drops
down to the unrestricted `.client` escape hatch.

```ts
const investor = createInvestorClient({ ...config, keypair });

investor.assertCapability('canTransfer', 'transfer'); // allowed
investor.assertCapability('canMint', 'mint'); // throws RoleCapabilityError
```

A denied guard reports `OPERATION_NOT_PERMITTED` together with the declared
role and operation name. This is an SDK-side preflight guard only; the contract
remains the authorization authority.

---

## Factory functions

### `createReadOnlyClient(config)`

No keypair required or accepted. Suitable for dashboards, indexers, and any
context that only queries data.

```ts
import { createReadOnlyClient } from '@aegis/sdk';

const aegis = createReadOnlyClient({
  environment: 'testnet',
  contractId: 'C_YOUR_CONTRACT_ID',
});

const isApproved = await aegis.compliance.checkWhitelist('G_USER_PUBLIC_KEY');
const portfolio  = await aegis.investor.getPortfolio('G_USER_PUBLIC_KEY');
```

Exposed modules: `compliance`, `investor`, `events`, `role_module`.
Not exposed: `asset`.

---

### `createInvestorClient(config)`

Requires a keypair. Exposes `asset.transfer()` in addition to the read surface.
Minting, whitelist management, and admin operations are not available.

```ts
import { createInvestorClient } from '@aegis/sdk';
import { Keypair } from '@stellar/stellar-sdk';

const aegis = createInvestorClient({
  environment: 'testnet',
  contractId: 'C_YOUR_CONTRACT_ID',
  keypair: Keypair.fromSecret('S_INVESTOR_SECRET'),
});

const txHash = await aegis.asset.transfer('G_RECIPIENT', 100);
```

---

### `createComplianceOperatorClient(config)`

Requires a keypair. Adds `assertWhitelistAccess()` as an explicit guard before
whitelist write operations. Minting and admin operations are not available.

```ts
import { createComplianceOperatorClient } from '@aegis/sdk';
import { Keypair } from '@stellar/stellar-sdk';

const aegis = createComplianceOperatorClient({
  environment: 'testnet',
  contractId: 'C_YOUR_CONTRACT_ID',
  keypair: Keypair.fromSecret('S_COMPLIANCE_OPERATOR_SECRET'),
});

// Confirm role before touching whitelist state
aegis.assertWhitelistAccess();

// Compliance reads are always available
const status = await aegis.compliance.checkWhitelist('G_USER_PUBLIC_KEY');
```

`assertWhitelistAccess()` throws `RoleCapabilityError` with code
`OPERATION_NOT_PERMITTED` if the client role does not include `canManageWhitelist`.
On a compliance-operator client it always succeeds.

---

### `createIssuerClient(config)`

Requires a keypair. Exposes `asset.mint()` and `asset.transfer()`. Whitelist
management and admin operations are not available.

```ts
import { createIssuerClient } from '@aegis/sdk';
import { Keypair } from '@stellar/stellar-sdk';

const aegis = createIssuerClient({
  environment: 'testnet',
  contractId: 'C_YOUR_CONTRACT_ID',
  keypair: Keypair.fromSecret('S_ISSUER_SECRET'),
});

const txHash = await aegis.asset.mint('G_INVESTOR', 5000);
```

---

### `createAdminClient(config)`

Requires a keypair. Full access — all modules and operations are available.
`assertAdminAccess()` and `assertWhitelistAccess()` are provided as explicit
guards for use before privileged operations.

```ts
import { createAdminClient } from '@aegis/sdk';
import { Keypair } from '@stellar/stellar-sdk';

const aegis = createAdminClient({
  environment: 'testnet',
  contractId: 'C_YOUR_CONTRACT_ID',
  keypair: Keypair.fromSecret('S_ADMIN_SECRET'),
});

// Confirm role before privileged call
aegis.assertAdminAccess();

const mintHash = await aegis.asset.mint('G_INVESTOR', 10000);
```

---

### `getRoleCapabilities(role)`

Returns the static `RoleCapabilities` object for a given role without
constructing a client. Useful for UI feature-flagging before initialization.

```ts
import { getRoleCapabilities } from '@aegis/sdk';

const caps = getRoleCapabilities('issuer');
console.log(caps.canMint);  // true
console.log(caps.canAdminister);  // false
```

---

## Error handling

When a capability guard fires, it throws a `RoleCapabilityError`:

```ts
import { RoleCapabilityError } from '@aegis/sdk';

try {
  aegis.assertAdminAccess();
} catch (err) {
  if (err instanceof RoleCapabilityError) {
    console.error(err.code);      // 'OPERATION_NOT_PERMITTED'
    console.error(err.role);      // e.g. 'investor'
    console.error(err.operation); // e.g. 'admin operation'
  }
}
```

`RoleCapabilityError` fields:

| Field       | Type                      | Description                                      |
|-------------|---------------------------|--------------------------------------------------|
| `code`      | `RoleCapabilityErrorCode` | `'OPERATION_NOT_PERMITTED'` or `'SIGNER_REQUIRED'` |
| `role`      | `ClientRole`              | The role the client was constructed with.        |
| `operation` | `string`                  | Human-readable name of the denied operation.     |

---

## Capability assumptions and security notes

The role-aware factory provides **SDK-level guardrails only**. It does not
perform on-chain authorization checks.

- Role capability flags are declared at construction time by the caller — they
  are not verified against the Aegis Soroban contract.
- An `issuer` client that calls `asset.mint()` will still be rejected by the
  contract if the configured keypair does not have issuer privileges on-chain.
- Use `assertAdminAccess()` and `assertWhitelistAccess()` as internal sanity
  checks in your own code, not as a substitute for contract-side authorization.
- The `role_module` on every client provides `discoverRole()` and
  `checkCapability()` for client-side UX gating — see
  [role-discovery.md](./role-discovery.md) for caveats.

The contract remains the sole source of truth for whether a transaction is
actually permitted.

---

## Accessing the underlying client

Every factory returns an object with a `.client` property that exposes the full
`AegisClient` instance. This is an intentional escape hatch and is **not**
narrowed by the role-aware TypeScript surface. Before using it for a
state-changing operation, call `assertCapability()` for the required capability;
contract-side authorization still remains authoritative. Prefer `.client` for
cross-cutting helpers such as `diagnoseNetworkFailure` and
`runNetworkOperation`.

```ts
const aegis = createReadOnlyClient({ ... });
const diagnostic = aegis.client.diagnoseNetworkFailure(someError);
```
