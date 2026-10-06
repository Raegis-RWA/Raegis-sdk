# SDK role and permission model

This document describes the **current** authorization model exposed by the Aegis SDK. It separates four concepts that are easy to conflate:

1. a role declared when a role-aware client is constructed;
2. whether a local signer is configured;
3. which operations the typed SDK surface exposes; and
4. whether the Aegis Soroban contract authorizes the submitted transaction.

The first three are SDK guardrails. **The contract remains the final authority for state-changing operations.** A client being constructed as `issuer` or `admin` does not prove that its key has that on-chain role.

For construction details, see [Role-Aware Client Factory](./role-aware-client-factory.md). For address classification intended for UI gating, see [Role Discovery & Capability Checks](./role-discovery.md).

## Roles

| Declared SDK role | Local signer | Current typed write surface | Intended use |
| --- | --- | --- | --- |
| `read-only` | Not accepted | None | Dashboards, indexers, portfolio/compliance/event reads |
| `investor` | Required | `asset.transfer()` | Investor-signed transfers |
| `compliance-operator` | Required | `asset.transfer()` plus `assertWhitelistAccess()` guard | Compliance-oriented clients that need an explicit local whitelist capability guard |
| `issuer` | Required | `asset.transfer()`, `asset.mint()` | Issuance and transfer flows |
| `admin` | Required | Full current `AssetModule` plus `assertAdminAccess()` and `assertWhitelistAccess()` guards | Privileged application code that deliberately opts into the broadest SDK surface |

### Important current limitation

The current `ComplianceModule` exposes `checkWhitelist()` only. There is **no whitelist mutation method on main today**. Therefore `assertWhitelistAccess()` is a local capability assertion; it does not itself change whitelist state or prove a contract role.

Likewise, the current main branch does not expose a generic protocol pause/unpause or role-management transaction API. `assertAdminAccess()` is a local SDK guard for code paths that intend to require an admin-declared client. It is not an on-chain admin check.

## Enforcement layers

### 1. Declared role

The factory functions declare the caller's intended role:

- `createReadOnlyClient()`
- `createInvestorClient()`
- `createComplianceOperatorClient()`
- `createIssuerClient()`
- `createAdminClient()`

The role controls the TypeScript surface returned to the caller. For example, an investor client exposes transfer but not mint.

### 2. Signer requirement

All signer-capable factories require a `Keypair`. A plain `AegisClient` may omit one for read-only use.

State-changing `AssetModule` operations call `AegisClient.requireSigner()`. If no keypair is configured, the SDK fails locally before submission with:

> Transaction signing requires a Keypair to be configured on the AegisClient.

Signer presence proves only that the SDK can sign. It does not prove issuer, admin, compliance, or whitelist status.

### 3. SDK capability guard

The role-aware factory narrows methods at compile time and uses `RoleCapabilityError` for its explicit guards.

`RoleCapabilityError` currently uses:

- `OPERATION_NOT_PERMITTED` when a declared role does not include a capability;
- `SIGNER_REQUIRED` as a public error code reserved for signer-related role-factory failures.

An SDK capability check answers **"is this operation allowed by this declared client shape?"**, not **"will the contract authorize it?"**

### 4. Contract authorization

The Soroban contract is the final authority. A signed transaction may still fail because the signer or target does not satisfy contract rules.

Do not treat a successful local role guard, role-discovery result, or signer check as authorization evidence. State-changing application flows should be written to handle contract rejection.

## Operation matrix

This matrix reflects the operations actually present on the current main branch.

| Operation | Roles exposed by typed factory | Signer required | SDK-side check | Contract / runtime rejection to expect |
| --- | --- | --- | --- | --- |
| `compliance.checkWhitelist(address)` | All roles | No | None beyond configuration/network validation | Thrown RPC/network failures propagate; an unsuccessful simulation response currently collapses to `false` |
| `investor.getPortfolio(address)` | All roles | No | Read-model validation and safe fallbacks | Compliance or asset read failures may produce an unavailable/partial read model |
| `events.*` and `role_module.*` reads | All roles | No for read paths | Module-specific validation | RPC/configuration errors; role discovery remains advisory |
| `asset.transfer(to, amount)` | investor, compliance-operator, issuer, admin | Yes | Typed surface + `requireSigner()` | Contract may reject an unauthorized signer, a non-compliant sender/recipient, invalid asset state, or other contract constraints |
| `asset.mint(to, amount)` | issuer, admin | Yes | Typed surface + `requireSigner()` | Contract may reject a signer without issuer/admin authority, a disallowed recipient, invalid asset state, or other contract constraints |
| `assertWhitelistAccess()` | compliance-operator, admin | Client role is signer-capable | Local `canManageWhitelist` check only | No transaction is submitted by the guard itself |
| `assertAdminAccess()` | admin | Client role is signer-capable | Local `canAdminister` check only | No transaction is submitted by the guard itself |

> **Current simulation caveat:** `ComplianceModule.checkWhitelist()` returns `false` when `simulateTransaction()` returns a non-success response or no result. At this API boundary, `false` therefore currently conflates a confirmed non-whitelisted response with an unsuccessful simulation response. Thrown RPC/network failures remain distinguishable. Applications that must distinguish those cases should not treat `false` alone as definitive authorization evidence.

## Role-specific guidance

### Read-only

Use for dashboards, monitoring, indexing, support tooling, and any path that should never hold a signing key.

```ts
const reader = createReadOnlyClient({
  environment: 'testnet',
  contractId: 'C...',
});

const approved = await reader.compliance.checkWhitelist(address);
const portfolio = await reader.investor.getPortfolio(address);
```

A read-only client intentionally has no typed `asset` surface.

### Investor

Use when the application needs an investor-owned signer for transfers.

```ts
const investor = createInvestorClient({
  environment: 'testnet',
  contractId: 'C...',
  keypair: investorKeypair,
});

await investor.asset.transfer(recipient, 100);
```

The local factory proves only that a signer was supplied and that transfer is permitted by the declared client shape. The contract can still reject the transaction.

### Compliance operator

Use when application code needs to distinguish compliance-operator intent from an ordinary investor client.

```ts
const operator = createComplianceOperatorClient({
  environment: 'testnet',
  contractId: 'C...',
  keypair: operatorKeypair,
});

operator.assertWhitelistAccess();
const approved = await operator.compliance.checkWhitelist(address);
```

Today this role does **not** expose a whitelist-write method because the current `ComplianceModule` does not implement one. Add such a method only together with the contract call, typed failure behaviour, and contract-authority checks required by that feature.

### Issuer

Use for asset issuance flows that need mint plus transfer.

```ts
const issuer = createIssuerClient({
  environment: 'testnet',
  contractId: 'C...',
  keypair: issuerKeypair,
});

await issuer.asset.mint(recipient, 5_000);
```

The declared issuer role does not verify the configured key's on-chain privileges. Treat contract rejection as authoritative.

### Admin

Use only in code that intentionally accepts the broadest current SDK capability surface.

```ts
const admin = createAdminClient({
  environment: 'testnet',
  contractId: 'C...',
  keypair: adminKeypair,
});

admin.assertAdminAccess();
await admin.asset.mint(recipient, 10_000);
```

`assertAdminAccess()` checks the declared SDK role. It does not query the contract for admin status.

## Expected unauthorized and failure behaviour

Applications should distinguish the following classes instead of collapsing them into "permission denied":

| Failure point | What it means | Typical handling |
| --- | --- | --- |
| TypeScript surface does not contain a method | The declared role intentionally does not expose that SDK operation | Fix the client role or application design; do not bypass with casts |
| `RoleCapabilityError` | A local role-aware guard rejected the operation | Treat as SDK configuration/programming error |
| `requireSigner()` error | A write path was reached without a configured keypair | Supply the appropriate signer-capable client or keep the path read-only |
| Contract submission/simulation rejection | The network/contract rejected the signed operation | Treat as authoritative; surface a safe operation-specific failure |
| Thrown RPC/network failure | Authorization may be unknown because the operation could not be evaluated/submitted | Do not reinterpret as permission success or failure |

The current `AssetModule` wraps mint and transfer submission errors in operation-specific `Error` messages. Until a contract-specific typed authorization error is available for those paths, consumers should not infer a role from raw text.

## The underlying client escape hatch

Every role-aware client exposes `.client`, the underlying `AegisClient`. This exists for advanced and diagnostic use, but it also bypasses the narrowed TypeScript surface.

For example, a read-only role object still has an underlying `AegisClient` instance. That does **not** grant write authority: without a signer, `requireSigner()` fails. A signer-capable caller that deliberately reaches through `.client` can bypass the factory's compile-time narrowing, so applications should treat that as an explicit security boundary and keep privileged wrappers small and reviewable.

## Example application policy

A safe application can layer these checks without confusing them:

1. Pick the narrowest factory role that matches the feature.
2. Keep signing keys out of read-only processes.
3. Use local role guards to catch application wiring mistakes early.
4. Use role discovery only for UX hints; it cannot currently discover issuer/admin authority.
5. Simulate/submit state changes and treat the contract result as authoritative.
6. Preserve distinct errors for local capability, missing signer, network failure, and contract rejection.

This keeps the SDK's developer-experience guardrails useful without presenting them as protocol authorization.
