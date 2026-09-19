# Migrating from Raw Soroban Calls to Aegis SDK

This guide walks through migrating existing raw Soroban contract call code to the Aegis SDK's structured module interface. Each section shows a before/after comparison, explains the benefits, and covers pitfalls.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setup & Initialization](#setup--initialization)
- [Compliance (KYC / Whitelist)](#compliance-kyc--whitelist)
- [Minting Tokens](#minting-tokens)
- [Transferring Tokens](#transferring-tokens)
- [Reading Investor Portfolios](#reading-investor-portfolios)
- [Error Handling](#error-handling)
- [Caveats & Gotchas](#caveats--gotchas)
- [Public API Reference](#public-api-reference)

---

## Prerequisites

Before migrating, ensure you have:

- `@stellar/stellar-sdk` v12+ installed
- `@aegis/sdk` installed
- A deployed Aegis contract on the target network
- Network passphrase and RPC URL for your target network

---

## Setup & Initialization

### Before (Raw Soroban)

```typescript
import { rpc, Contract, nativeToScVal, Keypair, Networks, Account, TransactionBuilder, xdr, scValToNative } from '@stellar/stellar-sdk';

const rpcServer = new rpc.Server('https://soroban-testnet.stellar.org');
const contractId = 'C_YOUR_CONTRACT_ID';
const networkPassphrase = Networks.TESTNET;

// Read-only call: check whitelist.
// simulateTransaction takes a built Transaction, not a bare operation — and
// since simulation never signs or submits, the source account doesn't need
// to be real; any structurally valid keypair works as a placeholder.
const contract = new Contract(contractId);
const call = contract.call('is_whitelisted', nativeToScVal(userAddress, { type: 'address' }));
const simSourceAccount = new Account(Keypair.random().publicKey(), '0');
const simTx = new TransactionBuilder(simSourceAccount, { fee: '100', networkPassphrase })
  .addOperation(call)
  .setTimeout(30)
  .build();
const result = await rpcServer.simulateTransaction(simTx);
const isWhitelisted = scValToNative(xdr.ScVal.fromXDR(result.result.retval, 'base64'));

// ⚠️ Write call: mint tokens — a privileged, state-changing operation.
// `adminKeypair` here must hold issuer/admin authority on the deployed
// contract. NEVER hardcode a real secret key; load it from a secret manager
// or an environment variable excluded from version control, e.g.:
//   const adminKeypair = Keypair.fromSecret(process.env.AEGIS_ISSUER_SECRET!);
const sourceAccount = new Account(adminKeypair.publicKey(), '0');
const mintCall = contract.call(
  'mint_asset',
  nativeToScVal(adminKeypair.publicKey(), { type: 'address' }),
  nativeToScVal(recipientAddress, { type: 'address' }),
  nativeToScVal(1000000000, { type: 'i128' })
);
const tx = new TransactionBuilder(sourceAccount, {
  fee: '1000',
  networkPassphrase,
})
  .addOperation(mintCall)
  .setTimeout(30)
  .build();
tx.sign(adminKeypair);
const response = await rpcServer.sendTransaction(tx);
```

### After (Aegis SDK)

```typescript
import { AegisClient } from '@aegis/sdk';
import { Keypair, Networks } from '@stellar/stellar-sdk';

// ⚠️ Privileged operation: `mint` requires a signer with issuer/admin
// authority on the deployed contract. NEVER hardcode a real secret key —
// load it from a secret manager or an environment variable that is
// excluded from version control.
const aegis = new AegisClient({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
  contractId: 'C_YOUR_CONTRACT_ID',
  keypair: Keypair.fromSecret(process.env.AEGIS_ISSUER_SECRET!),
});

// Read-only: check whitelist — no keypair required for this call.
const isWhitelisted = await aegis.compliance.checkWhitelist(userAddress);

// Write: mint tokens (privileged — see warning above)
const txHash = await aegis.asset.mint(recipientAddress, 1000000000);
```

### What Changed

| Concern | Raw Calls | SDK |
|---------|-----------|-----|
| XDR encoding | Manual `nativeToScVal` for every argument | Automatic |
| Simulation | Manual `simulateTransaction` + type guard | Built into module methods |
| Transaction building | Manual `TransactionBuilder` + `Account` + signing | Handled internally |
| Result parsing | Manual `xdr.ScVal.fromXDR` + `scValToNative` | Automatic via `parseSorobanResult` |

---

## Compliance (KYC / Whitelist)

### Before

```typescript
import { rpc, Contract, nativeToScVal, xdr, scValToNative, Account, TransactionBuilder, Keypair } from '@stellar/stellar-sdk';

async function checkWhitelist(
  rpcServer: rpc.Server,
  contractId: string,
  networkPassphrase: string,
  address: string
): Promise<boolean> {
  const contract = new Contract(contractId);
  const call = contract.call('is_whitelisted', nativeToScVal(address, { type: 'address' }));

  // simulateTransaction takes a built Transaction, not a bare operation.
  // Simulation never signs or submits, so a real account isn't required —
  // any structurally valid source account works, e.g. a throwaway keypair.
  const sourceAccount = new Account(Keypair.random().publicKey(), '0');
  const tx = new TransactionBuilder(sourceAccount, { fee: '100', networkPassphrase })
    .addOperation(call)
    .setTimeout(30)
    .build();
  const result = await rpcServer.simulateTransaction(tx);

  if (rpc.Api.isSimulationSuccess(result) && result.result) {
    const parsed = scValToNative(xdr.ScVal.fromXDR(result.result.retval, 'base64'));
    return parsed as boolean;
  }

  return false;
}
```

### After

```typescript
const isWhitelisted = await aegis.compliance.checkWhitelist(address);
```

### Benefits

- No manual XDR encoding or decoding.
- Simulation success checks are handled internally.
- Error cases (RPC failures, parse errors) are thrown with descriptive messages.

---

## Minting Tokens

⚠️ **Privileged operation.** `signer` below must hold issuer/admin authority on
the deployed contract. Never hardcode a real secret key — load it from a
secret manager or an environment variable excluded from version control.

### Before

```typescript
import { Contract, nativeToScVal, TransactionBuilder, Account } from '@stellar/stellar-sdk';

async function mintTokens(
  rpcServer: rpc.Server,
  contractId: string,
  networkPassphrase: string,
  signer: Keypair,
  to: string,
  amount: number
): Promise<string> {
  const contract = new Contract(contractId);
  const call = contract.call(
    'mint_asset',
    nativeToScVal(signer.publicKey(), { type: 'address' }),
    nativeToScVal(to, { type: 'address' }),
    nativeToScVal(amount, { type: 'i128' })
  );

  // In production, fetch the real sequence number
  const sourceAccount = new Account(signer.publicKey(), '0');

  const tx = new TransactionBuilder(sourceAccount, {
    fee: '1000',
    networkPassphrase,
  })
    .addOperation(call)
    .setTimeout(30)
    .build();

  tx.sign(signer);

  try {
    const response = await rpcServer.sendTransaction(tx);
    return response.hash;
  } catch (error) {
    throw new Error(`Mint transaction failed: ${error}`);
  }
}
```

### After

```typescript
const txHash = await aegis.asset.mint(recipientAddress, amount);
```

### Benefits

- No manual argument encoding (`nativeToScVal` calls).
- Transaction building, signing, and submission are handled internally.
- The `requireSigner()` guard ensures a keypair is configured before attempting writes.

---

## Transferring Tokens

⚠️ **Privileged operation.** `signer` below must be the token holder, or must
otherwise be authorized to move the asset per the deployed contract's rules.
Never hardcode a real secret key — load it from a secret manager or an
environment variable excluded from version control.

### Before

```typescript
async function transferTokens(
  rpcServer: rpc.Server,
  contractId: string,
  networkPassphrase: string,
  signer: Keypair,
  to: string,
  amount: number
): Promise<string> {
  const contract = new Contract(contractId);
  const call = contract.call(
    'transfer',
    nativeToScVal(signer.publicKey(), { type: 'address' }),
    nativeToScVal(to, { type: 'address' }),
    nativeToScVal(amount, { type: 'i128' })
  );

  const sourceAccount = new Account(signer.publicKey(), '0');

  const tx = new TransactionBuilder(sourceAccount, {
    fee: '1000',
    networkPassphrase,
  })
    .addOperation(call)
    .setTimeout(30)
    .build();

  tx.sign(signer);

  const response = await rpcServer.sendTransaction(tx);
  return response.hash;
}
```

### After

```typescript
const txHash = await aegis.asset.transfer(recipientAddress, amount);
```

### Benefits

- The SDK verifies a signer is configured via `requireSigner()` before building the transaction.
- Error messages wrap the raw RPC failure for easier debugging.

---

## Reading Investor Portfolios

### Before

Reading a full portfolio required multiple manual calls and assembly logic:

```typescript
// Manual portfolio assembly
async function getPortfolio(
  rpcServer: rpc.Server,
  contractId: string,
  networkPassphrase: string,
  investorAddress: string
) {
  // simulateTransaction takes a built Transaction, not a bare operation.
  // Simulation never signs or submits, so a real account isn't required —
  // any structurally valid source account works, e.g. a throwaway keypair.
  const buildSimTx = (call: any) => {
    const sourceAccount = new Account(Keypair.random().publicKey(), '0');
    return new TransactionBuilder(sourceAccount, { fee: '100', networkPassphrase })
      .addOperation(call)
      .setTimeout(30)
      .build();
  };

  // 1. Check KYC
  const contract = new Contract(contractId);
  const whitelistCall = contract.call(
    'is_whitelisted',
    nativeToScVal(investorAddress, { type: 'address' })
  );
  const whitelistResult = await rpcServer.simulateTransaction(buildSimTx(whitelistCall));
  const isKycApproved =
    rpc.Api.isSimulationSuccess(whitelistResult) && whitelistResult.result
      ? scValToNative(xdr.ScVal.fromXDR(whitelistResult.result.retval, 'base64'))
      : false;

  // 2. Query balance
  const balanceCall = contract.call(
    'balance',
    nativeToScVal(investorAddress, { type: 'address' })
  );
  const balanceResult = await rpcServer.simulateTransaction(buildSimTx(balanceCall));
  const balance =
    rpc.Api.isSimulationSuccess(balanceResult) && balanceResult.result
      ? scValToNative(xdr.ScVal.fromXDR(balanceResult.result.retval, 'base64'))
      : 0;

  // 3. Assemble status manually
  const status = !isKycApproved ? 'blocked' : balance === 0 ? 'empty' : 'active';

  return { investorAddress, isKycApproved, balance, status };
}
```

### After

```typescript
const portfolio = await aegis.investor.getPortfolio(investorAddress);

console.log(portfolio.status);               // 'active' | 'empty' | 'blocked' | 'unavailable'
console.log(portfolio.holdings.length);       // number of asset holdings
console.log(portfolio.holdings[0].formattedBalance); // "500.00"
console.log(portfolio.holdings[0].transferEligibility); // { isEligible: true, ... }

// Multi-asset support
const multiAssetPortfolio = await aegis.investor.getPortfolio(investorAddress, {
  assetContractIds: ['C_CONTRACT_1', 'C_CONTRACT_2'],
  includeMetadata: true,
});
```

### Benefits

- Single method call aggregates KYC check, balance query, metadata, and status logic.
- Returns a typed `InvestorPortfolio` object (see [types/portfolio.ts](../src/types/portfolio.ts)).
- Handles individual asset query failures gracefully (marks them unavailable without crashing).
- `formattedBalance` is pre-computed for display.

---

## Error Handling

### Before

Raw Soroban error handling requires manual checks at every step:

```typescript
try {
  // `tx` here is a built Transaction (see the Compliance section above) —
  // simulateTransaction does not accept a bare operation or a wrapper object.
  const result = await rpcServer.simulateTransaction(tx);
  if (rpc.Api.isSimulationSuccess(result) && result.result) {
    return scValToNative(xdr.ScVal.fromXDR(result.result.retval, 'base64'));
  }
  // What do you return here? false? null? throw?
  return false;
} catch (error) {
  // Raw error object — no context about which operation failed
  console.error('RPC error:', error);
  throw error;
}
```

### After (SDK)

The SDK provides structured error handling:

```typescript
import { PortfolioError } from '@aegis/sdk';

try {
  const isWhitelisted = await aegis.compliance.checkWhitelist(address);
} catch (error) {
  if (error instanceof Error) {
    console.error('Compliance check failed:', error.message);
  }
}

// Portfolio queries don't throw — they return a safe fallback
const portfolio = await aegis.investor.getPortfolio(investorAddress);

if (portfolio.status === 'unavailable') {
  console.warn(`Portfolio data unavailable: ${portfolio.error}`);
  // Show offline indicator or cached data
} else if (portfolio.status === 'blocked') {
  // Prompt KYC re-verification
} else {
  // Safe to render holdings
}
```

### Error Taxonomy

The SDK defines typed error codes for portfolio operations:

| Code | Meaning |
|------|---------|
| `RPC_FAILURE` | Soroban RPC node unreachable or returned an error |
| `PARSE_ERROR` | Contract returned data that doesn't match expected types |
| `COMPLIANCE_ERROR` | KYC / whitelist query failed |
| `UNAVAILABLE` | Catch-all for degraded read state |
| `INVALID_ADDRESS` | Investor address is missing or malformed |

See [errors/portfolio.ts](../src/errors/portfolio.ts) for the full error class.

---

## Caveats & Gotchas

### 1. Sequence Numbers

The SDK uses `Account(publicKey, '0')` as a placeholder for the source account sequence number. In production, you **must** fetch the real sequence number from the Stellar network before submitting write transactions. This is a known limitation — see the `TODO` in [src/asset.ts](../src/asset.ts).

### 2. Read-Only vs Write Clients

If no `keypair` is provided in the `AegisClientConfig`, the client operates in read-only mode. Calling `asset.mint()` or `asset.transfer()` will throw:

```
Transaction signing requires a Keypair to be configured on the AegisClient.
```

Use `client.requireSigner()` to verify configuration before write operations, or create separate clients for read-only and write access.

### 3. Simulation Before Submission

The `mint()` and `transfer()` methods do **not** simulate before submitting. To pre-check for auth failures (e.g., non-whitelisted recipient), call `compliance.checkWhitelist()` first, or wrap the call in a try/catch and interpret the error.

### 4. Multi-Contract Portfolios

`investor.getPortfolio()` supports querying multiple asset contracts via the `assetContractIds` option. If omitted, it defaults to the single contract ID configured on the client.

### 5. Network Timeouts

Write operations (`mint`, `transfer`) use a 30-second timeout by default. If the network is congested, transactions may expire. The SDK does not currently retry automatically.

### 6. TypeScript Types

All SDK return types are fully typed. Import them directly from `@aegis/sdk`:

```typescript
import type {
  InvestorPortfolio,
  AssetHolding,
  AssetMetadata,
  TransferEligibility,
  PortfolioStatus,
  FetchPortfolioOptions,
} from '@aegis/sdk';
```

---

## Public API Reference

| Module | Method | Description |
|--------|--------|-------------|
| `AegisClient` | `constructor(config)` | Initialize the SDK client |
| `AegisClient` | `requireSigner()` | Verify a signing keypair is configured |
| `ComplianceModule` | `checkWhitelist(address)` | Check if an address is KYC-approved |
| `AssetModule` | `mint(to, amount)` | Mint RWA tokens to a recipient |
| `AssetModule` | `transfer(to, amount)` | Transfer RWA tokens to a whitelisted recipient |
| `InvestorModule` | `getPortfolio(address, options?)` | Fetch full portfolio read model |
| `parseSorobanResult(xdrString)` | — | Decode raw XDR to JS value (internal utility) |

For complete type signatures, see:
- [API Reference](./api-reference.md)
- [Investor Portfolio Documentation](./investor-portfolio.md)
- [Source: src/types/portfolio.ts](../src/types/portfolio.ts)
- [Source: src/errors/portfolio.ts](../src/errors/portfolio.ts)
