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

Whitelist / KYC verification module. Accessed via `client.compliance`. Wraps the contract's `is_whitelisted` read-only function.

### `checkWhitelist(address: string): Promise<boolean>`

Queries the contract to check if a user is KYC-approved (whitelisted).

**Signature**
```typescript
public async checkWhitelist(address: string): Promise<boolean>
```

**Parameters**
* `address` (string): The Stellar public key (`G...`) to check.

**Returns**
`Promise<boolean>` — `true` if the simulated call to `is_whitelisted` succeeds and decodes to `true`. Resolves to `false` both when the contract reports the address is not whitelisted, *and* when the simulation does not succeed or returns no result — the current implementation does not distinguish those two cases in its return value.

**Errors**
* If `simulateTransaction` throws, the client network boundary classifies it as a typed, safe `NetworkFailure`. Synchronous address/XDR construction and result parsing remain outside that boundary and may throw their underlying error.
* A failed/unsuccessful simulation that does *not* throw is swallowed and reported as `false` (see Returns above), not as an error.

**Example**
```typescript
import { AegisClient } from '@aegis/sdk';
import { Networks } from '@stellar/stellar-sdk';

const client = new AegisClient({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
  contractId: 'C...', // Aegis Protocol Contract ID
});

try {
  const isWhitelisted = await client.compliance.checkWhitelist('G_USER_PUBLIC_KEY');
  console.log('Is User Whitelisted?', isWhitelisted);
} catch (error) {
  // Raised on RPC/network failure during simulation — not a PortfolioError.
  console.error('Whitelist check failed:', error);
}
```

> **Open note:** `checkWhitelist` passes the raw invocation object returned by `contract.call(...)` directly as the `transaction` field to `simulateTransaction` (cast through `as any`), rather than assembling a full `Transaction` via `TransactionBuilder` the way `AssetModule.mint`/`transfer` do. The source itself flags this with a comment ("Cast required depending on SDK version wrapper"), so the exact request shape expected by `simulateTransaction` across `@stellar/stellar-sdk` versions is not fully confirmed — verify against the installed SDK version rather than assuming it's stable.

### `checkWhitelistBatch(addresses, options?): Promise<ComplianceBatchResult>`

Checks multiple investor addresses with per-item validation, bounded
concurrency, input-order preservation, and safe partial-failure mapping.

**Signature**
```typescript
public async checkWhitelistBatch(
  addresses: readonly string[],
  options: ComplianceBatchOptions = {},
): Promise<ComplianceBatchResult>
```

**Parameters**
* `addresses` (`readonly string[]`): Stellar account public keys (`G...`). Runtime non-string, malformed, muxed (`M...`), and contract (`C...`) inputs become per-item `invalid-address` results without reaching RPC.
* `options.concurrency` (number, optional): Maximum simultaneous checks. Defaults to `4`; integer range 1–20.
* `options.deduplicate` (boolean, optional): Query identical valid addresses once and fan out the result. Defaults to `true`.
* `options.maxBatchSize` (number, optional): Maximum accepted input length. Defaults to `100`; integer range 1–1000.

**Returns**
`Promise<ComplianceBatchResult>` with:

* one frozen item per input, in original order;
* item statuses `whitelisted`, `not-whitelisted`, `invalid-address`, or `failed`;
* `isWhitelisted: false` on invalid/failed items (fail closed, but callers must branch on `status`);
* safe `NetworkFailureDiagnostic` data on failed items;
* counts, actual RPC query count, duplicate count, partial/exhausted flags, rate-limit flag, duration, and fetch timestamp.

An empty input returns a successful empty result. Individual invalid inputs,
network failures, and parse failures do not reject the batch. Invalid arbitrary
input is not echoed; correlate through `item.index`.

**Errors**
Throws `ComplianceBatchError` before RPC when the runtime input is not an array
(`INVALID_BATCH_INPUT`), exceeds `maxBatchSize` (`BATCH_TOO_LARGE`), or contains
invalid options (`INVALID_BATCH_OPTIONS`). Expected per-item failures are returned,
not thrown.

**Example**
```typescript
const result = await client.compliance.checkWhitelistBatch(
  ['G_INVESTOR_ONE', 'G_INVESTOR_TWO'],
  { concurrency: 4 },
);

for (const item of result.items) {
  console.log(item.index, item.status, item.isWhitelisted);
}
```

### `buildComplianceBatchDiagnostic(result): ComplianceBatchDiagnostic`

Builds a frozen, address-free roll-up for telemetry and support reports. It
contains counts, classified failure-code counts, a recovery action, and the
largest safe `retryAfterSeconds` value. It never includes item addresses,
original invalid input, raw errors, RPC URLs, headers, or credentials.

See [Compliance Batch Queries](./compliance-batch-queries.md) for performance,
rate-limit, retry, dashboard, and security guidance.

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
