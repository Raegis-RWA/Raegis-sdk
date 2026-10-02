# Testing Utilities

The Aegis SDK ships a **local mock client** for unit tests, Storybook fixtures, and dashboard examples. The mock client returns predictable responses without connecting to Soroban RPC.

## Import path and public export decision

Mock utilities are published on a **dedicated subpath**, not the main package entry:

```typescript
import { createMockAegisClient, createMockFixtures } from '@aegis/sdk/testing';
```

They are **intentionally excluded** from `@aegis/sdk` so production bundles do not pull in test helpers by default. The subpath is part of the public API for integrators building dashboards and test suites, but it is documented as **test-only** and must not be used in production runtime code.

| Export | Purpose |
|--------|---------|
| `@aegis/sdk` | Production client (`AegisClient`) |
| `@aegis/sdk/testing` | Local mock client and fixtures |

## Quickstart

```typescript
import { createMockAegisClient, createMockFixtures } from '@aegis/sdk/testing';

const fixtures = createMockFixtures();
const client = createMockAegisClient({ keypair: fixtures.signer });

// Configure predictable state
client.setWhitelisted(fixtures.investorAddress, true);
client.setBalance(fixtures.investorAddress, '5000000000'); // raw integer (7 decimals → 500.00)

// Compliance
const isApproved = await client.compliance.checkWhitelist(fixtures.investorAddress);
const batch = await client.compliance.checkWhitelistBatch([
  fixtures.investorAddress,
  fixtures.secondaryInvestorAddress,
]);

// Investor portfolio read model
const portfolio = await client.investor.getPortfolio(fixtures.investorAddress);

// Asset writes return mock transaction receipts (no live RPC)
const txHash = await client.asset.mint(fixtures.investorAddress, 1000);
console.log(client.transactions[0]); // { hash, type, from, to, amount, timestamp }
```

## API overview

### `createMockAegisClient(config?)`

Creates an in-memory `MockAegisClient` with the same module surface as `AegisClient`:

* `client.compliance.checkWhitelist(address)` → `Promise<boolean>`
* `client.compliance.checkWhitelistBatch(addresses, options?)` → `Promise<ComplianceBatchResult>`
* `client.asset.mint(to, amount)` → `Promise<string>` (mock tx hash)
* `client.asset.transfer(to, amount)` → `Promise<string>` (mock tx hash)
* `client.investor.getPortfolio(address, options?)` → `Promise<InvestorPortfolio>`

### State helpers

| Method | Description |
|--------|-------------|
| `setWhitelisted(address, boolean)` | KYC / whitelist status |
| `setBalance(address, balance, contractId?)` | Raw integer balance string |
| `setAssetMetadata(contractId, metadata)` | Override asset metadata |
| `reset()` | Clear all in-memory state and receipts |

### Fixtures

| Export | Description |
|--------|-------------|
| `createMockFixtures()` | Ephemeral keypairs and addresses (no hardcoded secrets) |
| `MOCK_CONTRACT_ID` | Placeholder contract ID |
| `MOCK_SECONDARY_CONTRACT_ID` | Second asset for multi-holding tests |
| `DEFAULT_MOCK_ASSET_METADATA` | Default RWA metadata |
| `buildMockTxHash(seq, type)` | Deterministic fake tx hash builder |

### Simulating failures

Pass `simulateComplianceFailure: true` to `createMockAegisClient` to make compliance checks throw, which drives `getPortfolio` to return `status: 'unavailable'`.

## Fake data policy

* Fixture keypairs are generated at runtime via `Keypair.random()` — no real secrets are committed to the repository.
* Contract IDs and transaction hashes use clearly fake prefixes (`CAAAA...`, `mock_tx_...`).
* Mock transaction receipts are stored in `client.transactions` for assertions.

## When to use mock vs. RPC mocks

| Scenario | Recommended approach |
|----------|---------------------|
| Dashboard / UI snapshot tests | `@aegis/sdk/testing` mock client |
| Testing production module RPC wiring | Jest mocks on `@stellar/stellar-sdk` (see `tests/investor.test.ts`) |
| End-to-end against testnet | Real `AegisClient` |

## Running tests

```bash
npm run test
```

Mock client coverage lives in `tests/mock-client.test.ts` and `tests/mock-client-examples.test.ts`.
