# Aegis SDK - Investor Portfolio Read Model

The `InvestorModule` provides a consolidated, typed read model (`InvestorPortfolio`) designed for investor dashboards, mobile wallets, and compliance monitoring screens. It aggregates asset balances, compliance whitelist status, asset metadata, formatted display amounts, and transfer eligibility into a single unified data structure.

For UI-friendly explanations of *why* an investor is approved, blocked, revoked, unknown, or unavailable — including reason codes and suggested next actions — see [Investor Eligibility Explanation](./investor-eligibility.md). Eligibility explanations are dashboard UX signals and do not imply a legal or regulatory guarantee.

## Accessing the Portfolio Module

Access `investor` via an initialized `AegisClient`:

```typescript
import { AegisClient } from '@aegis/sdk';
import { Networks } from '@stellar/stellar-sdk';

const client = new AegisClient({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
  contractId: 'C...', // Aegis Protocol Contract ID
});

// Fetch complete portfolio for an investor address
const portfolio = await client.investor.getPortfolio('G...');
console.log(`Portfolio Status: ${portfolio.status}`);
```

---

## `InvestorPortfolio` Data Model

```typescript
export type PortfolioStatus = 'active' | 'empty' | 'blocked' | 'unavailable' | 'unknown';

export interface TransferEligibility {
  isEligible: boolean;
  reason?: string;
  code?: string;
}

export interface AssetMetadata {
  symbol: string;
  name: string;
  decimals: number;
  isRwa: boolean;
  category?: string;
  contractId?: string;
}

export interface AssetHolding {
  assetId: string;
  balance: string; // Raw integer string (e.g. "5000000000")
  formattedBalance: string; // Formatted decimal string (e.g. "500.00")
  metadata: AssetMetadata;
  isCompliant: boolean;
  transferEligibility: TransferEligibility;
}

export interface InvestorPortfolio {
  investorAddress: string;
  status: PortfolioStatus;
  totalHoldingsCount: number;
  compliantHoldingsCount: number;
  holdings: AssetHolding[];
  isKycApproved: boolean;
  isBlocked: boolean;
  fetchedAt: string; // ISO 8601 Timestamp
  error?: string;
}
```

---

## Portfolio Operational States

| Status | Description | `isKycApproved` | `isBlocked` |
| :--- | :--- | :--- | :--- |
| `active` | Investor is KYC approved and has active (>0) asset holdings. | `true` | `false` |
| `empty` | Investor is KYC approved but holds zero balance across assets. | `true` | `false` |
| `blocked` | Investor is non-whitelisted or KYC revoked. Transfers are disabled. | `false` | `true` |
| `unavailable` | RPC simulation failure, network timeout, or contract query error occurred. Safe fallback returned. | `false` | `true` |

---

## Options

Customize the query with `FetchPortfolioOptions`:

```typescript
const portfolio = await client.investor.getPortfolio('G...', {
  includeMetadata: true,
  assetContractIds: [
    'C_CONTRACT_ID_1',
    'C_CONTRACT_ID_2',
  ],
});
```

---

## Resilient Error Handling

If an RPC network failure or contract simulation failure occurs, `getPortfolio()` will **not throw an unhandled exception** to calling applications. Instead, it safely returns an `InvestorPortfolio` object with `status: 'unavailable'` and details in `portfolio.error`:

```typescript
const portfolio = await client.investor.getPortfolio('G...');

if (portfolio.status === 'unavailable') {
  console.warn(`Portfolio data unavailable: ${portfolio.error}`);
  // Display offline indicator or cached fallback UI
} else if (portfolio.status === 'blocked') {
  // Prompt user for KYC re-verification
}
```
