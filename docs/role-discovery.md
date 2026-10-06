# Aegis SDK - Role Discovery & Capability Checks

The `RoleModule` provides a client-side classification of an address's standing with
the Aegis protocol, and helper checks for whether the SDK can attempt common actions
(viewing a portfolio, receiving a transfer, initiating a transfer, minting) on its
behalf.

## Important: what this module is, and is not

The Aegis Soroban contract does not currently expose a role query function (no
`get_role`, `is_admin`, or similar). Everything `RoleModule` reports is derived from:

* **Whitelist approval evidence**, via `ComplianceModule.checkWhitelist()`. The current Boolean helper is fail-closed: some unsuccessful or missing-result simulations also return `false`.
* **Local signer configuration**, i.e. whether the `AegisClient` was constructed with
  a `Keypair` matching the address in question.

This makes `RoleModule` a **developer-experience and dashboard-gating convenience** —
useful for deciding what UI to show (e.g. a "Mint" button or a "whitelist approval not established" banner).
It is **not** on-chain authorization, is **not** legal, financial, or compliance
advice, and must **never** be used as the sole check before submitting a
state-changing transaction. The contract itself is always the final authority on
whether a transaction is actually permitted to succeed — always simulate/submit
through `AssetModule` and handle rejection, regardless of what `RoleModule` reports.

For the wider responsibility boundary across whitelist state, role predictions,
contract events, receipts, dashboard presentation, and off-chain policy decisions,
see [Compliance and legal boundaries](./compliance-boundaries.md).

Because of this, `admin` and `issuer` roles cannot currently be discovered — only
`investor` (whitelist approval established), `unauthorized` (the Boolean whitelist helper returned `false`), and `unknown` (address invalid or a whitelist query threw) are distinguishable today. Because `checkWhitelist()` also returns `false` for some unsuccessful/missing-result simulations, `unauthorized` is fail-closed and is not proof that the contract explicitly returned a negative whitelist result. Admin/issuer
discovery is a natural extension once the contract exposes a role query; `RoleModule`
is structured so that can be added without changing its public shape.

## Accessing the Role Module

Access `role` via an initialized `AegisClient`:

```typescript
import { AegisClient } from '@aegis/sdk';
import { Networks } from '@stellar/stellar-sdk';

const client = new AegisClient({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
  contractId: 'C...', // Aegis Protocol Contract ID
});

const roleResult = await client.role.discoverRole('G...');
console.log(`Role: ${roleResult.role}`);
```

---

## Role Discovery

```typescript
const result = await client.role.discoverRole(investorAddress);
```

Returns a `RoleDiscoveryResult`:

```typescript
export type RoleName = 'investor' | 'unauthorized' | 'unknown';
export type RoleDiscoveryCode = 'OK' | 'INVALID_ADDRESS' | 'COMPLIANCE_QUERY_FAILED';

export interface RoleDiscoveryResult {
  address: string;
  role: RoleName;
  isKycApproved: boolean;
  hasLocalSigner: boolean;
  reason?: string;
  code: RoleDiscoveryCode;
  discoveredAt: string;
}
```

| `role` | Meaning |
| :--- | :--- |
| `investor` | Address is KYC/whitelist approved. |
| `unauthorized` | Whitelist approval was not established by the current helper. This can represent an explicit negative result or a fail-closed simulation result. |
| `unknown` | Address was invalid, or a whitelist query threw and reached RoleModule's error path — see `reason`. Some unsuccessful/missing-result simulations are instead collapsed to `unauthorized` by the current Boolean helper. |

## Capability Checks

Check a single capability:

```typescript
const result = await client.role.checkCapability(address, 'initiate_transfer');
if (!result.isPermitted) {
  console.warn(result.reason);
}
```

Or evaluate every known capability at once, for dashboard gating:

```typescript
const matrix = await client.role.getCapabilityMatrix(address);
```

Supported capabilities (`CapabilityName`) and how each is evaluated:

| Capability | Requires | Notes |
| :--- | :--- | :--- |
| `view_portfolio` | Nothing | Always permitted; read-only, unrestricted in the current SDK. |
| `receive_transfer` | Address is whitelisted | Mirrors the eligibility logic used by `InvestorModule`. |
| `initiate_transfer` | Address is whitelisted **and** a matching local signer is configured | Both checks must pass. |
| `mint_asset` | A matching local signer is configured | Does **not** check whitelist status — minting authority (issuer/admin) is a contract-side concern the SDK cannot verify. `isPermitted: true` here only means the SDK has enough configuration to *attempt* the call; the contract may still reject it. |

Every `CapabilityCheckResult` has `verified: false` — a reminder that this is a
client-side prediction, not a contract-confirmed guarantee:

```typescript
export interface CapabilityCheckResult {
  capability: CapabilityName;
  isPermitted: boolean;
  verified: boolean; // always false today — see note above
  reason?: string;
  code: CapabilityCheckCode;
}
```

## Edge Cases & Failure States

| Situation | Behaviour |
| :--- | :--- |
| Empty or non-string address | Returns immediately with `code: 'INVALID_ADDRESS'`; no RPC call is made. |
| Whitelist RPC call throws | Returns safely with `code: 'COMPLIANCE_QUERY_FAILED'` and the underlying error message in `reason`. The module never throws for this case — consistent with `InvestorModule`'s safe-fallback pattern. |
| Whitelist simulation is unsuccessful or has no result | `ComplianceModule.checkWhitelist()` currently returns `false`, so role discovery becomes `unauthorized` / capability checks become `NOT_WHITELISTED`. Treat this as approval not established rather than proof of an explicit negative contract result. |
| No signer configured on the client | `initiate_transfer` and `mint_asset` return `code: 'NO_SIGNER_CONFIGURED'`. |
| Signer configured for a *different* address than the one being checked | `hasLocalSigner` / the signer-dependent checks resolve to `false`, since the module checks that the client's keypair matches the specific address being evaluated, not just that a keypair exists. |

## Compatibility

`RoleModule` is additive: it reads from `ComplianceModule` and `AegisClient.keypair`,
and introduces no changes to existing modules' behavior. It follows the same
constructor pattern (`new RoleModule(client)`), naming conventions, and safe-fallback
error handling already used by `ComplianceModule` and `InvestorModule`.
