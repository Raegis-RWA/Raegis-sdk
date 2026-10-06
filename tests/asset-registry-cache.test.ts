import {
  AssetRegistryCacheEntry,
  AssetRegistryCacheScope,
  InMemoryAssetRegistryCache,
  isAssetRegistryCacheEntryFresh,
  isSameAssetRegistryCacheScope,
} from '../src';

const scope: AssetRegistryCacheScope = {
  networkPassphrase: 'network-a',
  contractId: 'contract-a',
  assetId: 'asset-a',
};

function entry(
  overrides: Partial<AssetRegistryCacheEntry<string>> = {}
): AssetRegistryCacheEntry<string> {
  return {
    scope,
    value: 'active',
    cachedAtMs: 1000,
    expiresAtMs: 2000,
    ...overrides,
  };
}

describe('asset registry cache policy', () => {
  test('freshness requires exact scope and a live lifetime', () => {
    expect(isAssetRegistryCacheEntryFresh(entry(), scope, 1500)).toBe(true);
    expect(isAssetRegistryCacheEntryFresh(entry(), scope, 2000)).toBe(false);
    expect(
      isAssetRegistryCacheEntryFresh(
        entry(),
        { ...scope, assetId: 'asset-b' },
        1500
      )
    ).toBe(false);
  });

  test('future and invalid timestamps are stale', () => {
    expect(
      isAssetRegistryCacheEntryFresh(
        entry({ cachedAtMs: 1600 }),
        scope,
        1500
      )
    ).toBe(false);
    expect(
      isAssetRegistryCacheEntryFresh(
        entry({ expiresAtMs: Number.POSITIVE_INFINITY }),
        scope,
        1500
      )
    ).toBe(false);
  });

  test('scope matching is exact across all identity fields', () => {
    expect(isSameAssetRegistryCacheScope(scope, { ...scope })).toBe(true);
    expect(
      isSameAssetRegistryCacheScope(scope, {
        ...scope,
        contractId: 'contract-b',
      })
    ).toBe(false);
    expect(
      isSameAssetRegistryCacheScope(scope, {
        ...scope,
        networkPassphrase: 'network-b',
      })
    ).toBe(false);
  });

  test('in-memory adapter expires entries and invalidates only the requested scope', () => {
    const cache = new InMemoryAssetRegistryCache<string>();
    const otherScope = { ...scope, assetId: 'asset-b' };

    cache.setWithTtl(scope, 'active', 100, 1000);
    expect(cache.getFresh(scope, 1099)?.value).toBe('active');
    expect(cache.getFresh(scope, 1100)).toBeUndefined();

    cache.setWithTtl(scope, 'active', 100, 2000);
    cache.setWithTtl(otherScope, 'other', 100, 2000);
    cache.delete(scope);
    expect(cache.getFresh(scope, 2050)).toBeUndefined();
    expect(cache.getFresh(otherScope, 2050)?.value).toBe('other');

    cache.clear();
    expect(cache.getFresh(otherScope, 2050)).toBeUndefined();
  });
});
