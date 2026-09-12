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
* `client.transaction`: Transaction result reconciliation module (`TransactionModule`). See [Transaction Result Reconciliation](./transaction-reconciliation.md).

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
* If `simulateTransaction` itself throws (network failure, malformed request, etc.), the error is logged via `console.error` and then re-thrown as-is. It is the raw error from the underlying `@stellar/stellar-sdk` RPC call — `checkWhitelist` does not wrap it in `PortfolioError` or any other typed error.
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

## `TransactionModule` & result reconciliation

Reconciles submitted Soroban transactions into typed outcomes. Accessed via
`client.transaction`. See [Transaction Result Reconciliation](./transaction-reconciliation.md)
for the status model and retry caution.

This module only reads transaction state. No method signs, submits, or
resubmits a transaction.

### `reconcile(input: ReconcileTransactionStatusInput): TransactionResult`

Reconciles a known hash and status without contacting RPC.

**Parameters**
* `input.hash` (string): 64-character hex transaction hash. Trimmed and lowercased.
* `input.status` (string): raw RPC status (`SUCCESS`, `FAILED`, `NOT_FOUND`, `PENDING`, `DUPLICATE`, `TRY_AGAIN_LATER`, `ERROR`, or any other string).
* `input.ledger` / `input.latestLedger` (number, optional): ledger metadata to carry into the result.
* `input.attempts` (number, optional): observation count. Defaults to `1`.
* `input.failureCode` (string, optional): pre-extracted failure code. Values that do not match `^[A-Z0-9][A-Z0-9_.:-]{0,63}$` are dropped.
* `input.observedAt` (`Date | string`, optional): observation timestamp. Defaults to now.
* `input.observationWindowExpired` (boolean, optional): converts a `pending` reading into `unknown` with code `OBSERVATION_WINDOW_EXPIRED`. Terminal statuses are unaffected.

**Returns**
A frozen `TransactionResult` discriminated on `status` (`confirmed` | `failed` | `pending` | `rejected` | `unknown`). Unrecognised statuses return `unknown` with code `UNRECOGNIZED_STATUS` rather than throwing.

**Errors**
Throws `TransactionReconciliationError` with code `INVALID_TRANSACTION_HASH` (hash is not 64 hex characters), `INVALID_STATUS` (status is not a non-empty string), `INVALID_POLL_OPTIONS` (`attempts` is not a positive integer), or `INVALID_TIMESTAMP` (`observedAt` is not a valid date).

### `reconcileSubmission(response, options?): TransactionResult`

**Signature**
```typescript
public reconcileSubmission(
  response: rpc.Api.SendTransactionResponse,
  options?: ReconcileTransactionResponseOptions,
): TransactionResult
```

Maps a `sendTransaction` response. `PENDING` and `DUPLICATE` are `pending`,
`ERROR` is `rejected`, `TRY_AGAIN_LATER` is `unknown`. When `errorResult` is
present, `failureCode` is set from the transaction result switch name only —
raw XDR is not copied. Same throw paths as `reconcile`.

### `getResult(hash: string): Promise<TransactionResult>`

Performs one `getTransaction` read. Returns `pending` for `NOT_FOUND`, which
means "not observed yet", not "failed".

**Errors**
Throws `TransactionReconciliationError` (`INVALID_TRANSACTION_HASH`) before any
RPC call, or `NetworkFailure` if the RPC read fails — the call goes through
`client.runNetworkOperation`.

### `waitForResult(hash, options?): Promise<TransactionResult>`

**Signature**
```typescript
public async waitForResult(
  hash: string,
  options?: WaitForTransactionOptions,
): Promise<TransactionResult>
```

**Parameters**
* `options.maxAttempts` (number): maximum `getTransaction` reads. Defaults to `10`.
* `options.intervalMs` (number): delay before the second read. Defaults to `1000`.
* `options.backoffFactor` (number): delay multiplier after each read. Defaults to `1.5`.
* `options.maxIntervalMs` (number): delay ceiling. Defaults to `8000`.
* `options.sleep` (`(ms: number) => Promise<void>`): injectable delay for deterministic tests. Defaults to `setTimeout`.

**Returns**
The first terminal result (`confirmed`, `failed`, or `rejected`). If the window
ends without inclusion, returns `unknown` with code
`OBSERVATION_WINDOW_EXPIRED` and `attempts` set to the number of reads made —
not an error and not a failure.

**Errors**
Throws `TransactionReconciliationError` with `INVALID_TRANSACTION_HASH`, or
`INVALID_POLL_OPTIONS` when `maxAttempts` is not a positive integer,
`intervalMs` is negative, `backoffFactor` is below `1`, or `maxIntervalMs` is
below `intervalMs`. Validation happens before any RPC call. RPC failures surface
as `NetworkFailure`.

### Standalone helpers

* `reconcileTransactionStatus(input)` — pure reconciler behind `client.transaction.reconcile`.
* `reconcileSendTransactionResponse(response, options?)` — pure submission reconciler.
* `reconcileGetTransactionResponse(hash, response, options?)` — pure `getTransaction` reconciler.
* `normalizeTransactionResultStatus(status)` — maps a raw RPC status string to a `TransactionResultStatus`; unrecognised values return `unknown`.
* `normalizeTransactionHash(hash)` — validates and lowercases a transaction hash; throws `TransactionReconciliationError`.
* `decodeTransactionResultCode(result)` — reads a transaction result's switch name as a stable uppercase code (`txFailed` becomes `TX_FAILED`). Returns `undefined` when the input is absent or unreadable; never throws.

**Example**
```typescript
const submitted = client.transaction.reconcileSubmission(sendResponse);

if (submitted.status === 'rejected') {
  throw new Error(`Rejected before inclusion: ${submitted.failureCode}`);
}

const result = await client.transaction.waitForResult(submitted.hash);

if (!result.terminal) {
  console.log('Still indeterminate — reconcile the same hash later, do not resubmit.');
}
```

> **Open note:** `AssetModule.mint` and `AssetModule.transfer` still return a
> bare hash string and do not inspect the submission status, so an `ERROR` or
> `TRY_AGAIN_LATER` submission currently looks the same as an accepted one.
> Pass the returned hash to `client.transaction.waitForResult` (or reconcile the
> raw `sendTransaction` response yourself) to learn the actual outcome.

---

## Error Handling Strategies

Soroban transactions and RPC queries can fail for several reasons. The SDK manages errors with custom taxonomy (`PortfolioError`) and safe fallbacks:
1. **Simulation Failures:** If a transaction is simulated and fails (e.g., trying to transfer to a non-whitelisted address), the SDK intercepts the RPC error and throws before submitting to the ledger.
2. **Transaction Timeouts:** If the Stellar network is congested and the transaction is not included in a ledger within the timeout window.
3. **XDR Parsing Errors:** If the contract returns data that does not match the expected return type.
4. **Safe Read Model Fallbacks:** Portfolio queries intercept network/RPC failures and return an `InvestorPortfolio` with `status: 'unavailable'` to prevent frontend application crashes.

> **Open note:** as described above under [Exported Types & Errors](#exported-types--errors-srcindexts), point 4 (safe fallbacks) matches what `InvestorModule.getPortfolio` does today, but `PortfolioError` itself is not currently thrown by `checkWhitelist`, `mint`, or `transfer` — those surface plain `Error` objects instead. Treat this section as the intended error-handling strategy for the SDK rather than a description of every method's current exact error type.
