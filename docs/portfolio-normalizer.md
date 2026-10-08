# Investor portfolio normalizer

The SDK already exposes `InvestorModule.getPortfolio()` for its native RPC-backed
portfolio read model. The normalizer is a separate, pure compatibility layer for
holdings that arrive from other asset reads, cached API responses, or dashboard
payloads with inconsistent field names.

## Usage

```ts
import {
  normalizeInvestorPortfolio,
  normalizePortfolioHolding,
} from '@aegis/sdk';

const portfolio = normalizeInvestorPortfolio([
  {
    asset_id: 'ASSET-42',
    raw_balance: '125000000',
    asset_symbol: 'RWA',
    asset_decimals: 7,
  },
  {
    contractId: 'C...',
    amount: '50000000',
    metadata: { symbol: 'BOND', decimals: 7 },
  },
]);

// portfolio.state === 'ready'
// portfolio.holdings[0].decimalBalance === '12.5'
```

## Supported source aliases

The normalizer accepts decoded objects and recognizes these compatibility fields:

| Meaning | Accepted fields |
| --- | --- |
| Asset identity | `assetId`, `asset_id`, `contractId`, `contract_id`, `id` |
| Raw base-unit balance | `balance`, `rawBalance`, `raw_balance`, `amount`, `quantity` |
| Precision | `decimals`, `assetDecimals`, `asset_decimals` |
| Metadata | top-level fields or nested `metadata` / `asset` objects |
| Unsupported marker | `supported: false`, `isSupported: false`, `unsupported: true`, or `status: "unsupported"` |

Input order is preserved. The normalizer does not deduplicate, fetch, price, or reorder
holdings.

## Assumptions and failure states

- Balances are integer base units. Decimal strings such as `"1.25"` are marked
  `unsupported` rather than guessed into a scale.
- When a supported row omits precision, the default is 7 decimals to match the
  SDK's existing Soroban portfolio model. Consumers can pass `defaultDecimals`
  when adapting another source.
- A generic `assetId` is not treated as a contract ID. `metadata.contractId`
  is populated only when the source actually provides `contractId` or
  `contract_id`.
- Missing asset identity produces an `unknown` row that remains in the result.
  Unknown rows are not silently discarded.
- Explicitly unsupported assets or malformed balance/precision data produce an
  `unsupported` row with a stable reason code.
- The aggregate state is `empty`, `ready`, `partial`, or `unusable`
  depending on whether zero, all, some, or none of the source rows are supported.

These statuses describe normalization quality only. They do not imply KYC status,
transfer eligibility, on-chain authorization, market value, or legal ownership.

## Display helpers

`formatPortfolioBalance(rawBalance, decimals)` converts integer base units to an
exact, locale-neutral decimal string without rounding. Apply locale/currency
formatting in the application layer.

`getPortfolioHoldingDisplayLabel(holding)` returns the best stable identifier in
this order: symbol, name, asset ID, then `UNKNOWN`. It intentionally does not add
localized UI copy.
