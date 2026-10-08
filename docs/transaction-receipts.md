# Transaction receipts

The SDK exposes a small, serialisable receipt model for contract operations that
need confirmation screens or audit-friendly UI state without retaining raw RPC
responses.

Supported operation classes are compliance updates, asset minting, asset
transfers, and investor updates.

## Build a receipt

```ts
import { Networks } from '@stellar/stellar-sdk';
import { buildTransactionReceipt } from '@aegis/sdk';

const receipt = buildTransactionReceipt({
  operation: 'asset-transfer',
  target: {
    assetId: 'RWA-2026-001',
    from: 'G...',
    to: 'G...',
    amount: '25',
  },
  status: 'SUCCESS',
  transactionHash: 'a'.repeat(64),
  networkPassphrase: Networks.TESTNET,
});

console.log(receipt.status);      // success
console.log(receipt.explorerUrl); // Stellar Expert testnet transaction URL
```

Status mapping is conservative: `SUCCESS` and `CONFIRMED` map to `success`;
`PENDING`, `DUPLICATE`, and `NOT_FOUND` map to `pending`; `FAILED` and
`ERROR` map to `failed`; unknown values map to `unknown`.

A successful receipt requires a 64-character hexadecimal transaction hash.
Unknown outcomes are never presented as successful. Unexpected non-string RPC status values also become `unknown` instead of throwing or being treated as confirmation. Wrong-type transaction hashes, amounts, failure codes, or explicitly null timestamps are rejected with the SDK's classified receipt errors, not raw JavaScript `TypeError`s.

## Explorer links

Public Network, Testnet, and Futurenet map to network-specific Stellar Expert
transaction URLs. Custom networks may provide an explicit HTTPS explorer base;
unsafe HTTP custom URLs are rejected.

The existing admin receipt helpers use the same hash, status, amount, timestamp,
failure-code, and explorer primitives so admin and general confirmation surfaces
do not drift into different rules.

Receipts describe observed transaction state. They do not submit, retry, or
alter contract operations.
