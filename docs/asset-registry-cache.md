# Asset registry cache policy

The SDK does not cache network reads automatically. Applications can either
provide their own `AssetRegistryCacheAdapter<T>` or use the process-local
`InMemoryAssetRegistryCache<T>`. Neither option fetches registry state or
authorizes a state-changing operation.

## Identity and freshness

Each cache entry is scoped by the exact tuple of network passphrase, contract
ID, and asset ID. Do not reuse an entry after any part of that tuple changes.

Use `isAssetRegistryCacheEntryFresh(entry, expectedScope, nowMs?)` when
implementing a custom adapter. It rejects scope mismatches, expired entries,
non-finite timestamps, and entries written in the future. The expiry boundary
is exclusive: an entry with `expiresAtMs === nowMs` is stale.

`AssetRegistryCacheAdapter<T>` defines the portable `get`, `set`, and
`delete` contract. `InMemoryAssetRegistryCache<T>` implements that contract
and adds `setWithTtl`, `getFresh`, and `clear`. Normal in-memory reads
should use `getFresh`: it evicts stale entries at the TTL boundary.

The built-in adapter is intentionally process-local. Applications that need
persistence, multi-process coordination, or bounded storage should provide an
adapter with those properties instead.

## Invalidation rules

Delete or bypass an affected entry when any of these occurs:

1. a successful local asset-registry write;
2. an asset-status or registry event for that asset;
3. an event-stream/indexer gap or reset;
4. a network or contract-deployment change;
5. an explicit operator refresh.

`AssetRegistryCacheInvalidationReason` provides stable names for those cases.
Use `delete(scope)` for an asset-specific invalidation. Use `clear()` when
event continuity is lost and the affected asset set is unknown.

A failed refresh must not extend the previous `expiresAtMs`. If event
continuity is uncertain, perform an authoritative read instead of assuming that
silence means the asset is unchanged.

## Example

```ts
import {
  AssetRegistryCacheScope,
  InMemoryAssetRegistryCache,
} from '@aegis/sdk';

const cache = new InMemoryAssetRegistryCache<AssetView>();
const scope: AssetRegistryCacheScope = {
  networkPassphrase: client.networkPassphrase,
  contractId: client.contractId,
  assetId,
};

const cached = cache.getFresh(scope);
if (cached) {
  renderAsset(cached.value);
} else {
  const value = await loadAssetFromAuthoritativeSource(assetId);
  cache.setWithTtl(scope, value, 30_000);
  renderAsset(value);
}
```

After a successful local registry mutation or an authoritative event for this
asset, call `cache.delete(scope)`. After an event-stream gap where affected
assets are unknown, call `cache.clear()` and repopulate from authoritative
reads.

Cached registry data is a read optimization, not authorization for a
state-changing operation. Refresh authoritative state when correctness, asset
eligibility, transfer restrictions, or other protocol-sensitive behavior
depends on current registry data.
