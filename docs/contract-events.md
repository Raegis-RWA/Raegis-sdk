# Contract Event Decoder

> **Compliance disclaimer:** Decoded compliance and whitelist events reflect protocol-level state reported by the Aegis Soroban contract. This SDK and its documentation do **not** constitute legal, financial, or regulatory compliance advice. Consult qualified counsel for compliance decisions.

The contract event decoder turns raw Soroban RPC events into typed Aegis audit-trail models for dashboards, indexers, and compliance monitors.

## Supported event categories

| Category | Topics | Typed output |
| -------- | ------ | ------------ |
| Compliance | `whitelist_add`, `whitelist_remove` | `kind: 'compliance'` |
| Minting | `mint`, `mint_asset` | `kind: 'mint'` |
| Transfers | `transfer` | `kind: 'transfer'` |
| Admin | `protocol_pause`, `protocol_unpause`, `asset_register` | `kind: 'admin'` |
| Asset metadata | `asset_metadata` | `kind: 'asset_metadata'` |
| Role | `role_grant`, `role_revoke` | `kind: 'role'` |
| Unknown | any other topic or malformed payload | `kind: 'unknown'` |

Topic aliases such as `whitelist_added`, `register_asset`, and `pause` are normalised automatically.

## Decode a single event

```typescript
import { decodeContractEvent } from '@aegis/sdk';

const decoded = decodeContractEvent({
  contractId: 'C...',
  txHash: 'a'.repeat(64),
  ledger: 12345,
  topic: rpcEvent.topic,   // base64 ScVals or parsed xdr.ScVal[]
  value: rpcEvent.value,   // base64 ScVal or parsed xdr.ScVal
});

if (decoded.kind === 'transfer') {
  console.log(decoded.from, decoded.to, decoded.amount);
}

if (decoded.kind === 'unknown') {
  console.warn(decoded.reason, decoded.rawTopics, decoded.rawValue);
}
```

By default the decoder **never throws** for unsupported topics. Pass `{ strict: true }` when you want `EventDecodeError` instead of an `unknown` fallback.

## Fetch and decode from RPC

```typescript
import { AegisClient } from '@aegis/sdk';

const client = new AegisClient({
  environment: 'testnet',
  contractId: 'C_YOUR_CONTRACT_ID',
});

const { events, latestLedger } = await client.events.fetchAndDecode({
  startLedger: 1000,
  filters: [
    {
      type: 'contract',
      contractIds: [client.contractId],
    },
  ],
});

for (const event of events) {
  switch (event.kind) {
    case 'compliance':
      // render KYC audit row
      break;
    case 'role':
      // render role audit row
      break;
    case 'mint':
    case 'transfer':
      // render transaction history row
      break;
    case 'admin':
      // render admin action timeline
      break;
    case 'asset_metadata':
      // refresh asset catalogue cache
      break;
    case 'unknown':
      // show generic audit row with raw payload
      break;
  }
}
```

## Edge cases and failure states

| Scenario | Non-strict (default) | Strict mode |
| -------- | -------------------- | ----------- |
| Empty or missing topics | `kind: 'unknown'` | throws `EventDecodeError` (`EMPTY_TOPICS` / `INVALID_EVENT_INPUT`) |
| Unknown topic name | `kind: 'unknown'` with reason | throws `UNSUPPORTED_EVENT` |
| Malformed value XDR | `kind: 'unknown'` with reason | throws `VALUE_DECODE_FAILED` |
| Known topic, missing required fields | `kind: 'unknown'` with reason | throws `UNSUPPORTED_EVENT` |
| RPC `getEvents` network failure | Propagates via `client.runNetworkOperation` as `NetworkFailure` | same |

Always handle `kind === 'unknown'` in UI code. Do not treat an `unknown` decode as a successful typed audit event.

## Security and compliance-sensitive assumptions

- **Protocol vs legal compliance:** Whitelist / KYC events are on-chain protocol signals only. Do not present them as KYC legal clearance or investment advice.
- **No secrets in events:** Decoded models keep addresses, amounts, and topic names. Do not attach private keys, seed phrases, or raw signing material to event models or logs.
- **Trust boundary:** Events prove what a successful contract call emitted. They are not a substitute for verifying transaction inclusion, signature validity, or admin authorization off-chain.
- **Successful calls only:** Prefer filtering on `inSuccessfulContractCall === true` for audit rows; failed invocations may still appear in diagnostic streams depending on RPC configuration.
- **Amount units:** Amounts are returned as raw integer strings (contract scale). Dashboard formatting must apply asset `decimals` separately.
- **Contract catalogue drift:** Topic names follow the Aegis event catalogue with aliases for forward compatibility. New contract topics land as `unknown` until the SDK map is extended.

## Dashboard integration guidance

1. **Audit trail table** — group decoded events by `txHash` and `ledger`, then map `kind` to UI columns (compliance, mint/transfer amount, admin action, metadata).
2. **Investor activity feed** — filter `kind === 'transfer' | 'mint'` where `to` or `from` matches the connected wallet.
3. **Admin console** — surface `kind === 'admin'` and `kind === 'compliance'` for operator review.
4. **Asset catalogue** — listen for `asset_metadata` and `asset_register` to update cached `AssetMetadata` without another RPC simulation call.
5. **Safe fallback UI** — always handle `kind === 'unknown'`; display `eventName`, `reason`, and a collapsed raw payload view instead of failing the page.

Pair decoded events with admin receipts (`buildAdminActionReceipt`) when you need explorer links and human-readable summaries for submitted transactions.

## Event compatibility

The decoder targets the Aegis Soroban contract event catalogue documented alongside the protocol. Contracts that emit additional topics continue to work through the `unknown` fallback.

| Compatibility level | Behaviour |
| ------------------- | --------- |
| Known topic + valid payload | Fully typed event |
| Known topic + partial payload | `unknown` with reason (non-strict mode) |
| Unknown topic | `unknown` with raw topics/value preserved |
| Malformed XDR value | `unknown` with decode reason |

When upgrading contracts, add new topics to your indexer filters first, then extend the SDK decoder in a follow-up release if you need typed support.

## Deterministic test fixtures

Use the shared fixtures in `tests/fixtures/contract-events.ts` or build base64 ScVals with `@stellar/stellar-sdk`:

```typescript
import { nativeToScVal } from '@stellar/stellar-sdk';

const topic = [
  nativeToScVal('transfer', { type: 'symbol' }).toXDR('base64'),
  nativeToScVal('G_FROM...', { type: 'address' }).toXDR('base64'),
  nativeToScVal('G_TO...', { type: 'address' }).toXDR('base64'),
];
const value = nativeToScVal(1_000_000n).toXDR('base64');
```

See `tests/events-decoder.test.ts` for full coverage of each event category and unknown fallback behaviour.

## Contributor review checklist

When changing the event decoder or event docs:

- [ ] New or changed topics are listed in the supported categories table above.
- [ ] Unknown / malformed inputs still produce a safe `unknown` fallback unless `strict: true` is documented.
- [ ] Compliance-related wording keeps the protocol-vs-legal disclaimer intact.
- [ ] Fixtures in `tests/fixtures/contract-events.ts` cover the new path.
- [ ] `docs/api-reference.md` and README links still point at this guide.
- [ ] Examples use placeholder addresses (`G...`, `C...`) only — never real secrets.
