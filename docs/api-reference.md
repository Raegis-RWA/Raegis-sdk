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
* If `simulateTransaction` throws, the call crosses `client.runNetworkOperation()` and rejects with the SDK's classified network failure rather than exposing the raw RPC payload.
* A failed/unsuccessful simulation that does *not* throw is reported as `false` (see Returns above), not as an error.

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


### `whitelist(address: string): Promise<string>`

Submits the protocol's canonical `whitelist_user(admin, user)` operation using the configured signer as the admin address.

**Signature**
```typescript
public async whitelist(address: string): Promise<string>
```

**Parameters**
* `address` (string): Stellar public key to add to the protocol whitelist.

**Returns**
`Promise<string>` — the transaction hash returned after the prepared transaction is submitted.

**Errors**
* Throws if the client has no configured signer.
* Account lookup, transaction preparation, and submission cross the SDK network-failure boundary and reject on RPC/network failure.

**Transaction construction**
The method fetches the signer's live account sequence, builds `whitelist_user(admin, user)`, calls Soroban RPC `prepareTransaction()`, signs the prepared envelope, and submits it.

---

## Admin CLI

Installing the package exposes `aegis-cli` through the package `bin` mapping.

```bash
aegis-cli [--env-file <path>] whitelist <address>
aegis-cli [--env-file <path>] mint <address> <amount>
```

By default the CLI reads `.env`; `--env-file` selects another file. Process environment values override file values. `AEGIS_ADMIN_SECRET` and `AEGIS_CONTRACT_ID` are required. The CLI supports the same environment/RPC/network overrides as `AegisClient`, including explicit mainnet opt-in, and prints the submitted transaction hash on success. Mint amounts must be positive safe integers. Operation error output redacts the configured admin secret.

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
* Account lookup, transaction preparation, and submission each cross `client.runNetworkOperation()`; a rejected network operation is then surfaced through the method's `Mint transaction failed: ...` wrapper.

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

> **Current transaction behavior:**
> * `mint` fetches the signer's live account sequence from RPC, builds the transaction, runs Soroban RPC `prepareTransaction()`, signs the prepared envelope, and submits it.
> * The returned hash confirms submission only; the method does not poll for final ledger inclusion.
> * The unit/scale of `amount` (e.g. whether it should already account for the asset's `decimals`) remains a contract-level integration concern and should be confirmed against the deployed `mint_asset` implementation.

### `transfer(to: string, amount: number): Promise<string>`

Transfers RWA tokens to another address by calling the contract's `transfer` function. Unlike the repaired `mint` path above, the current transfer implementation still builds from a hardcoded source sequence and submits without `prepareTransaction()`.

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

> **Open note:** `transfer` still constructs its source account with sequence `"0"`; this caveat now applies to `transfer` only, since `mint` fetches the live account sequence and prepares the transaction before signing.

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
