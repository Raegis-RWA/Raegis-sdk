# Typed Activity & History Mapping

The SDK can normalize decoded Aegis contract events and admin action receipts into one typed activity model for dashboards, support tooling, and audit-oriented history views.

```ts
import {
  mapAegisActivity,
  mapAegisHistory,
  type AegisActivity,
} from '@aegis/sdk';

const decoded = client.events.decode(rpcEvent);
const activity = mapAegisActivity(decoded);

const history = mapAegisHistory([
  decoded,
  adminReceipt,
]);
```

## Model

Every activity has:

- a discriminated `kind` (`compliance`, `mint`, `transfer`, `admin`, `asset-metadata`, or `unknown`);
- a stable status vocabulary (`confirmed`, `pending`, `failed`, or `unknown`);
- its source (`contract-event` or `admin-receipt`);
- transaction/ledger metadata when the source provides it;
- a safe, fixed summary plus kind-specific typed fields.

The mapper deliberately omits raw unknown-event payloads. Unknown events retain only their safe decoder reason and envelope metadata, so a future contract payload is not copied into logs or support reports by default.

## Ordering and identity

`mapAegisHistory()` preserves the caller's input order. It does not guess ledger close times or merge multiple observations that share a transaction hash.

Activity ids use source + transaction hash (or ledger fallback) + kind + input position. This makes ids deterministic for the same input history and distinguishes repeated events in one transaction. When mapping repeated events individually with `mapAegisActivity()`, pass their sequence position explicitly if those ids will coexist.

Contract-event `observedAt` is the decoder's `decodedAt` timestamp. It is **not** a claim about ledger close time.

## Status semantics

- A decoded contract event from a successful contract call maps to `confirmed`; one marked `inSuccessfulContractCall: false` maps to `failed`.
- Admin receipt `success` maps to `confirmed`, while `pending`, `failed`, and `unknown` preserve their uncertainty.
- A confirmed protocol event or receipt describes protocol/network state only. It is not legal, regulatory, KYC, or investment advice.

## Unknown events

Forward-compatible decoding defaults to keeping unknown events:

```ts
const history = mapAegisHistory(inputs);
```

Callers that deliberately do not want them can opt out:

```ts
const history = mapAegisHistory(inputs, {
  includeUnknownEvents: false,
});
```

Filtering does not renumber later entries, so ids for retained activities stay stable relative to the original input sequence.
