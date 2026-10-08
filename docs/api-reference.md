# API Reference

> **Compliance disclaimer:** `ComplianceModule` and the whitelist-gated behavior of `AssetModule` reflect protocol-level checks performed by the Aegis Soroban contract (e.g. `is_whitelisted`). They report what the contract reports — this SDK and its documentation do not constitute legal, financial, or regulatory compliance advice. Consult qualified counsel for compliance decisions.

## `AegisClient`

The entry point for interacting with the Aegis Protocol.

### Constructor Parameters
* `environment` (`'testnet' | 'local' | 'mainnet'`, optional): A typed environment preset that supplies `rpcUrl` and `networkPassphrase` automatically. See [Environment Presets](./environments.md).
* `rpcUrl` (string, optional): The URL of the Soroban RPC node you are connecting to. Required if `environment` is omitted; otherwise overrides the preset's default.
* `networkPassphrase` (string, optional): The Stellar network passphrase (e.g., `Networks.TESTNET` or `Networks.PUBLIC`). Required if `environment` is omitted; otherwise overrides the preset's default.
* `contractId` (string): The StrKey-encoded Contract ID of the deployed Aegis contract.
* `keypair` (Keypair, optional): A Stellar SDK Keypair object used for signing state-changing transactions (like minting or transferring). If omitted, the client can only make read-only calls.
* `allowMainnet` (boolean, optional): Must be `true` to use `environment: 'mainnet'`, which is gated until the Aegis protocol is live on the public network.

Either `environment` or both `rpcUrl` and `networkPassphrase` must be provided. Invalid or unsafe configuration (malformed URLs, insecure `http://` overrides outside the `local` preset, empty passphrases, unavailable environments) throws a `ConfigValidationError`.

### Client Modules
* `client.compliance`: Whitelist & KYC verification module (`ComplianceModule`).
* `client.asset`: Minting & transferring RWA tokens module (`AssetModule`).
* `client.investor`: Investor portfolio read model module (`InvestorModule`). See [Investor Portfolio Documentation](./investor-portfolio.md).
* `client.role`: Role discovery & capability checks module (`RoleModule`). See [Role Discovery & Capability Checks Documentation](./role-discovery.md).
* `client.events`: Contract event fetch/decode module (`EventsModule`). See [Contract Event Decoder Documentation](./contract-events.md).

---

## `ComplianceModule`

Whitelist/compliance lifecycle module. Accessed via `client.compliance`. The
current verified contract read method is `is_whitelisted`. This SDK build does
not expose a verified whitelist-write contract method, so admin mutation is
explicitly gated instead of guessing an ABI entrypoint.

See [Compliance Lifecycle Client](./compliance-lifecycle.md) for usage and
security/compliance boundaries.

### `checkWhitelist(address: string): Promise<boolean>`

Compatibility boolean query. Returns `true` only when the contract simulation
produces a confirmed boolean true. A confirmed false or unusable simulation
returns false.

The address is validated as a Stellar Ed25519 account before RPC work.
Invalid input throws `ComplianceLifecycleError` with
`code: "INVALID_ADDRESS"`. Thrown RPC failures pass through the client's typed
network-failure boundary.

Prefer `getComplianceStatus()` when an application must distinguish a confirmed
negative result from an unavailable read.

### `getComplianceStatus(address: string): Promise<ComplianceStatusSnapshot>`

Returns one of three conservative protocol states:

| Status | Code | Meaning |
| --- | --- | --- |
| `approved` | `WHITELIST_APPROVED` | Contract returned true. |
| `not-approved` | `WHITELIST_NOT_APPROVED` | Contract returned false. |
| `unavailable` | `READ_UNAVAILABLE` | No reliable boolean was observed or the read failed. |

`eligible` is true/false only for confirmed contract booleans and null when the
read is unavailable. Provider error details are not copied into the returned
snapshot.

### `diagnoseLifecycle(): ComplianceLifecycleDiagnostic`

Returns a serializable capability snapshot describing the verified read method,
whether a signer is configured, and the admin-write capability state. The
current admin state is:

```ts
{
  supported: false,
  requiresSigner: true,
  reasonCode: 'CONTRACT_WRITE_METHOD_UNAVAILABLE'
}
```

The diagnostic reports `legalStatus: "not-assessed"` and never includes signer
key material.

### `updateWhitelist(address: string, approved: boolean): Promise<never>`

Explicitly gated mutation path. The method validates the address and then:

1. throws `SIGNER_REQUIRED` when no signer is configured;
2. with a signer present, throws `ADMIN_UPDATE_UNSUPPORTED` because this SDK
   source does not have a verified whitelist-write contract method.

This ordering preserves the signer boundary for mutating flows without
fabricating a Soroban call. Once a contract write ABI is verified, this method
can be implemented behind the same typed surface.

Role-aware callers may also use
`createComplianceOperatorClient(...).assertWhitelistAccess()` or
`createAdminClient(...).assertWhitelistAccess()` before entering an admin flow.
Those are SDK-level capability guardrails, not on-chain authorization.

### `ComplianceLifecycleError`

Typed error codes:

- `INVALID_ADDRESS` — invalid Stellar account address;
- `SIGNER_REQUIRED` — mutation attempted without signer capability;
- `ADMIN_UPDATE_UNSUPPORTED` — no verified contract whitelist-write method is
  available in this SDK build.

> Compliance state is protocol data, not legal advice or proof of KYC/AML
> completion. Contract authorization remains authoritative for protocol actions.


---

## `AssetModule`

Minting & transferring RWA tokens. Accessed via `client.asset`. Both methods require the `AegisClient` to be constructed with a `keypair`, since they build and sign a state-changing transaction.

### `mint(to: string, amount: number): Promise<string>`

Submits a transaction to mint new RWA tokens by calling the contract's `mint_asset` function.

**Signature**
```typescript
public async mint(to: string, amount: number): Promise<string>
```

**Parameters**
* `to` (string): Stellar public key of the recipient.
* `amount` (number): Amount to mint, passed to the contract as an `i128` via `nativeToScVal`.

**Returns**
`Promise<string>` — the transaction hash (`response.hash`) returned by `sendTransaction` immediately after submission. This confirms the transaction was *submitted*, not that it was included in a ledger or succeeded — the method does not poll for final status.

**Errors**
* Throws a plain `Error` synchronously (via `client.requireSigner()`) if the `AegisClient` was constructed without a `keypair`: `"Transaction signing requires a Keypair to be configured on the AegisClient."`
* If `sendTransaction` rejects (e.g. the ledger rejects the transaction due to a missing authorization, a non-whitelisted recipient, or a bad sequence number), the error is caught and re-thrown as a new generic `Error` with message `` `Mint transaction failed: ${error}` ``. The original error is interpolated into the message string only — it is not attached as `.cause`, and it is not a `PortfolioError` or other typed error.

**Example**
```typescript
import { AegisClient } from '@aegis/sdk';
import { Networks, Keypair } from '@stellar/stellar-sdk';

const client = new AegisClient({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
  contractId: 'C...',
  keypair: issuerKeypair, // required for mint/transfer; omit for read-only usage
});

try {
  const txHash = await client.asset.mint('G_RECIPIENT_PUBLIC_KEY', 1000);
  console.log('Mint submitted, tx hash:', txHash);
} catch (error) {
  console.error('Mint failed:', error);
}
```

> **Open notes (from the source itself):**
> * The transaction's source `Account` sequence number is currently hardcoded to `"0"` (`new Account(signer.publicKey(), "0")`). A comment in `src/asset.ts` reads: *"In production, you must fetch the real sequence number for the account."* As written, this will not build a valid transaction against an account with a non-zero sequence number — confirm this has been resolved before using `mint` against a real account.
> * There is no pre-submission simulation. A `// TODO` in the source notes: *"Implement transaction simulation endpoint before submitting to check for auth/whitelist failures."* Authorization or whitelist failures currently only surface as a submission-time error from `sendTransaction`, not as an upfront check.
> * The unit/scale of `amount` (e.g. whether it should already account for the asset's `decimals`) is not documented or validated in the source — confirm against the deployed contract's `mint_asset` implementation before use.

### `transfer(to: string, amount: number): Promise<string>`

Transfers RWA tokens to another address by calling the contract's `transfer` function. Built the same way as `mint` (manual `TransactionBuilder`, hardcoded source sequence number, no pre-submission simulation).

**Signature**
```typescript
public async transfer(to: string, amount: number): Promise<string>
```

**Parameters**
* `to` (string): Stellar public key of the recipient.
* `amount` (number): Amount to transfer, passed to the contract as an `i128` via `nativeToScVal`.

**Returns**
`Promise<string>` — transaction hash from `sendTransaction`, with the same "submission, not confirmation" caveat as `mint`.

**Errors**
* Same `requireSigner()` precondition as `mint` (throws if no `keypair` is configured).
* Catches `sendTransaction` failures and re-throws a generic `Error` with message `` `Transfer transaction failed: ${error}` ``. The source has an open `// TODO: Improve error typing for unauthorized transfer attempts` — a transfer rejected for compliance reasons (e.g. recipient not whitelisted) is not currently distinguishable, by error type, from any other submission failure.

**Example**
```typescript
try {
  const txHash = await client.asset.transfer('G_RECIPIENT_PUBLIC_KEY', 500);
  console.log('Transfer submitted, tx hash:', txHash);
} catch (error) {
  console.error('Transfer failed:', error);
}
```

> **Open note:** the same hardcoded sequence-number-`"0"` caveat described under `mint` applies here, since `transfer` builds its transaction the same way.

---

## `InvestorModule`

Read model service for building investor dashboard views.

### Methods
* `getPortfolio(investorAddress: string, options?: FetchPortfolioOptions): Promise<InvestorPortfolio>`
  Fetches investor balances, KYC whitelist compliance, asset metadata, formatted display balances, transfer eligibility, and operational portfolio status (`active`, `empty`, `blocked`, `unavailable`).

## `RoleModule`

Client-side role discovery and capability checks. Not a substitute for on-chain
authorization — see [Role Discovery & Capability Checks Documentation](./role-discovery.md)
for the full security note.

### Methods
* `discoverRole(address: string): Promise<RoleDiscoveryResult>`
  Classifies an address as `investor`, `unauthorized`, or `unknown` based on whitelist status.
* `checkCapability(address: string, capability: CapabilityName): Promise<CapabilityCheckResult>`
  Evaluates a single capability (`view_portfolio`, `receive_transfer`, `initiate_transfer`, `mint_asset`).
* `getCapabilityMatrix(address: string): Promise<CapabilityMatrix>`
  Evaluates all known capabilities for an address in one call.

## `EventsModule` & event decoder

Typed Soroban contract event decoding for audit trails. See [Contract Event Decoder Documentation](./contract-events.md).

### Methods
* `client.events.decode(input, options?)` — decode a single raw or parsed RPC event.
* `client.events.fetchAndDecode(request, options?)` — call `getEvents` and decode the response.

### Standalone helpers
* `decodeContractEvent(input, options?)` — pure decoder with `unknown` fallback by default.
* `decodeContractEvents(inputs, options?)` — batch decode preserving order.
* `normalizeEventTopicName(name)` / `isKnownAegisEventTopic(name)` — topic compatibility helpers.

## Error Handling Strategies

Soroban transactions and RPC queries can fail for several reasons. The SDK manages errors with custom taxonomy (`PortfolioError`) and safe fallbacks:
1. **Simulation Failures:** If a transaction is simulated and fails (e.g., trying to transfer to a non-whitelisted address), the SDK intercepts the RPC error and throws before submitting to the ledger.
2. **Transaction Timeouts:** If the Stellar network is congested and the transaction is not included in a ledger within the timeout window.
3. **XDR Parsing Errors:** If the contract returns data that does not match the expected return type.
4. **Safe Read Model Fallbacks:** Portfolio queries intercept network/RPC failures and return an `InvestorPortfolio` with `status: 'unavailable'` to prevent frontend application crashes.

> **Open note:** as described above under [Exported Types & Errors](#exported-types--errors-srcindexts), point 4 (safe fallbacks) matches what `InvestorModule.getPortfolio` does today, but `PortfolioError` itself is not currently thrown by `checkWhitelist`, `mint`, or `transfer` — those surface plain `Error` objects instead. Treat this section as the intended error-handling strategy for the SDK rather than a description of every method's current exact error type.
