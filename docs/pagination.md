# Typed pagination

The SDK exposes one reusable pagination contract for read-heavy modules:

```ts
interface PaginationRequest {
  cursor?: string;
  limit?: number;
}
```

`limit` defaults to `100` and must be a safe integer from `1` through `10,000`.
A supplied cursor must be a non-empty string. Invalid input throws
`PaginationValidationError` with either `INVALID_CURSOR` or `INVALID_LIMIT`.

Cursors are opaque. Store and return the exact cursor supplied by the SDK or an
upstream service; do not parse or construct one in application code.

## Continuation states

Every typed page reports one of three states:

- `available`: another page is known to exist and includes its cursor.
- `complete`: the current read model has no more items.
- `unknown`: a resumable cursor exists, but the upstream response does not prove
  whether another item currently exists.

Treat `unknown` as resumable, not as `complete`. A dashboard may request the next
page with its cursor and stop when it receives `complete` or an empty result.

## Contract events

`EventsModule.fetchAndDecode()` validates `cursor` and `limit`, forwards them to
Soroban RPC, and returns pagination metadata alongside the existing `events`,
`latestLedger`, and `cursor` fields. Values supplied in the options object take
precedence over the same fields in the RPC request.

Soroban event queries cannot combine `startLedger` and `cursor`. The SDK rejects
that combination before making a network request. Because the RPC response used
by this SDK exposes a last-event paging token without an authoritative
`hasNext`, a non-empty event page reports `unknown` continuation with that token.
An empty page reports `complete`.

```ts
const first = await aegis.events.fetchAndDecode(
  { filters: [{ type: 'contract', contractIds: [aegis.contractId] }] },
  { limit: 50 }
);

if (first.pagination.continuation.state === 'unknown') {
  const next = await aegis.events.fetchAndDecode(
    { filters: [{ type: 'contract', contractIds: [aegis.contractId] }] },
    {
      cursor: first.pagination.continuation.cursor,
      limit: 50,
    }
  );
}
```

## Investor holdings

`InvestorModule.paginateHoldings()` pages the holdings of an already-fetched
`InvestorPortfolio`. This keeps pagination deterministic for that portfolio
snapshot and avoids repeating compliance and balance reads for each page.

```ts
const portfolio = await aegis.investor.getPortfolio(investorAddress);
let page = aegis.investor.paginateHoldings(portfolio, { limit: 25 });

while (page.pagination.continuation.state === 'available') {
  page = aegis.investor.paginateHoldings(portfolio, {
    cursor: page.pagination.continuation.cursor,
    limit: 25,
  });
}
```

The in-memory holdings cursor currently encodes an offset, but it remains an SDK
implementation detail. A cursor is valid only for the same portfolio snapshot.
Fetch a new portfolio and restart without a cursor when the underlying holdings
may have changed.
