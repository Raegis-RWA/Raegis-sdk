# Compliance status cache strategy

`ComplianceModule.checkWhitelist()` reads protocol-level whitelist state from
the configured Aegis contract. Repeating that read for every dashboard render
can add latency and RPC load, but an old approval can remain visible after an
address has been removed. This strategy defines the narrow boundary in which a
dashboard may cache those reads.

> A cached whitelist value is a time-bounded protocol snapshot, not legal,
> financial, or regulatory advice. It must not be treated as current after its
> expiry or used as the authorization decision for a transaction.

## SDK boundary

The SDK does **not** cache compliance status automatically. Applications opt in
by implementing `ComplianceStatusCacheAdapter`, creating entries explicitly,
and selecting a maximum age that matches their revocation-response requirement.
This keeps cache behavior visible to the application and its operators.

Cache only dashboard presentation reads. Always bypass the cache and perform a
new read when the user refreshes status, begins a compliance-sensitive flow, or
prepares a write such as mint or transfer. The contract remains the final
authorization authority even when a fresh preflight read succeeds.

There is no universally safe TTL. Establish a maximum staleness budget with the
team responsible for the deployment. The `15_000` milliseconds below is an
example for a foreground dashboard, not a protocol guarantee or recommended
value for every application. Measure the TTL from when the request starts so
network latency cannot extend the intended window.

## Cache identity and entry shape

Every key must contain all of:

- `networkPassphrase` — prevents testnet, local, and public-network reuse;
- `contractId` — isolates contract deployments and upgrades; and
- `address` — isolates subjects.

Do not key on address alone. Keep the exact scope in the stored entry and check
it again on retrieval. `isComplianceCacheEntryFresh()` performs that scope
check and rejects expired, malformed, non-finite, or future-dated timestamps.
It does not fetch, store, refresh, or invalidate data.

```typescript
import {
  AegisClient,
  ComplianceCacheScope,
  ComplianceStatusCacheAdapter,
  ComplianceStatusCacheEntry,
  isComplianceCacheEntryFresh,
} from '@aegis/sdk';

async function readStatusForDisplay(
  client: AegisClient,
  cache: ComplianceStatusCacheAdapter,
  address: string,
): Promise<ComplianceStatusCacheEntry> {
  const scope: ComplianceCacheScope = {
    networkPassphrase: client.networkPassphrase,
    contractId: client.contractId,
    address,
  };

  const cached = await cache.get(scope);
  if (cached && isComplianceCacheEntryFresh(cached, scope)) {
    return cached;
  }

  const checkedAt = Date.now();
  const isWhitelisted = await client.compliance.checkWhitelist(address);
  const current = {
    scope,
    isWhitelisted,
    checkedAt,
    expiresAt: checkedAt + 15_000,
  } satisfies ComplianceStatusCacheEntry;

  // The current boolean API cannot distinguish a contract denial from every
  // non-throwing unsuccessful simulation, so this conservative example does
  // not persist `false` as a confirmed denial.
  if (isWhitelisted) {
    await cache.set(current);
  }
  return current;
}
```

The adapter may use memory, private browser storage, or an application-owned
server cache. Avoid public/CDN caches and shared keys that can disclose or mix
status across users or tenants. Protect server-side cache access like the
underlying compliance read.

## Invalidation assumptions

TTL expiry is the correctness backstop. Events and mutations only shorten the
window; they must not extend it. Invalidate the exact scoped entry when:

1. a whitelist add/remove operation for the address is confirmed;
2. a decoded `whitelist_add` or `whitelist_remove` event is observed;
3. the configured network, contract ID, or deployment version changes;
4. an operator or user requests a refresh; or
5. an event stream reconnects after a gap and missed events cannot be ruled out.

After a bulk policy change or uncertain deployment change, invalidate the
entire affected network-and-contract namespace. In multi-tab or multi-instance
dashboards, propagate invalidations to every cache instance. Event delivery may
be delayed, duplicated, reordered, or missed, so event-driven invalidation is
an optimization rather than the sole freshness guarantee.

## Stale values and failures

Both stale outcomes have risk:

- stale `true` can show an address as approved after revocation; and
- stale `false` can hide a recent approval and incorrectly block the UI.

On expiry, show the state as stale/unknown while revalidating; do not label it
current. A previous value may be shown only as explicitly timestamped
"last-known" history. Never use stale-while-revalidate for an authorization
decision, never extend `expiresAt` because refresh failed, and never overwrite a
known snapshot with an error.

`checkWhitelist()` currently returns `false` for both a contract-reported denial
and a non-throwing unsuccessful simulation. Thrown RPC failures are typed at the
client network boundary, but dashboard code must not convert a caught failure
into a cacheable `false`. The example therefore caches only `true`; consumers
with a separate, unambiguous status source may also store confirmed denials. If
the application must distinguish every denial from every unsuccessful
simulation, the current boolean API is not sufficient; keep the UI state
unknown and require a confirmed fresh read instead of inferring approval or
denial.

## Dashboard checklist

- Render separate loading, fresh, stale/unknown, and failed states.
- Display `checkedAt` and offer an explicit refresh control.
- Deduplicate simultaneous reads for the same full scope without extending TTL.
- Use short, risk-reviewed TTLs and record the chosen revocation-response SLA.
- Bypass cache for writes and compliance-sensitive decisions.
- Invalidate on confirmed mutations/events, while retaining TTL as a backstop.
- Log cache age and invalidation reason without logging secrets or sensitive RPC
  payloads.
