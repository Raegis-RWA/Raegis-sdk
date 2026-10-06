/**
 * Identity for one consumer-owned asset registry cache entry.
 */
export interface AssetRegistryCacheScope {
  networkPassphrase: string;
  contractId: string;
  assetId: string;
}

export interface AssetRegistryCacheEntry<T> {
  scope: AssetRegistryCacheScope;
  value: T;
  cachedAtMs: number;
  expiresAtMs: number;
}

export interface AssetRegistryCacheAdapter<T> {
  get(
    scope: AssetRegistryCacheScope
  ):
    | AssetRegistryCacheEntry<T>
    | undefined
    | Promise<AssetRegistryCacheEntry<T> | undefined>;
  set(entry: AssetRegistryCacheEntry<T>): void | Promise<void>;
  delete(scope: AssetRegistryCacheScope): void | Promise<void>;
}

export type AssetRegistryCacheInvalidationReason =
  | 'asset-write'
  | 'asset-status-event'
  | 'registry-event-gap'
  | 'network-change'
  | 'contract-change'
  | 'manual';

export function isSameAssetRegistryCacheScope(
  left: AssetRegistryCacheScope,
  right: AssetRegistryCacheScope
): boolean {
  return (
    left.networkPassphrase === right.networkPassphrase &&
    left.contractId === right.contractId &&
    left.assetId === right.assetId
  );
}

export function isAssetRegistryCacheEntryFresh<T>(
  entry: AssetRegistryCacheEntry<T>,
  expectedScope: AssetRegistryCacheScope,
  nowMs: number = Date.now()
): boolean {
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(entry.cachedAtMs) ||
    !Number.isFinite(entry.expiresAtMs)
  ) {
    return false;
  }

  if (
    entry.cachedAtMs > nowMs ||
    entry.expiresAtMs <= entry.cachedAtMs ||
    entry.expiresAtMs <= nowMs
  ) {
    return false;
  }

  return isSameAssetRegistryCacheScope(entry.scope, expectedScope);
}

function assetRegistryCacheKey(scope: AssetRegistryCacheScope): string {
  return JSON.stringify([
    scope.networkPassphrase,
    scope.contractId,
    scope.assetId,
  ]);
}

function cloneAssetRegistryCacheEntry<T>(
  entry: AssetRegistryCacheEntry<T>
): AssetRegistryCacheEntry<T> {
  return {
    ...entry,
    scope: { ...entry.scope },
  };
}

/**
 * Process-local cache for applications that do not need a persistent adapter.
 * It performs no network I/O and never authorizes a state change.
 */
export class InMemoryAssetRegistryCache<T>
  implements AssetRegistryCacheAdapter<T>
{
  private readonly entries = new Map<string, AssetRegistryCacheEntry<T>>();

  public get(
    scope: AssetRegistryCacheScope
  ): AssetRegistryCacheEntry<T> | undefined {
    const entry = this.entries.get(assetRegistryCacheKey(scope));
    return entry ? cloneAssetRegistryCacheEntry(entry) : undefined;
  }

  public set(entry: AssetRegistryCacheEntry<T>): void {
    if (
      !Number.isFinite(entry.cachedAtMs) ||
      !Number.isFinite(entry.expiresAtMs) ||
      entry.expiresAtMs <= entry.cachedAtMs
    ) {
      throw new RangeError(
        'asset registry cache entry requires finite timestamps and expiresAtMs > cachedAtMs'
      );
    }

    const stored = cloneAssetRegistryCacheEntry(entry);
    this.entries.set(assetRegistryCacheKey(stored.scope), stored);
  }

  public delete(scope: AssetRegistryCacheScope): void {
    this.entries.delete(assetRegistryCacheKey(scope));
  }

  public clear(): void {
    this.entries.clear();
  }

  public getFresh(
    scope: AssetRegistryCacheScope,
    nowMs: number = Date.now()
  ): AssetRegistryCacheEntry<T> | undefined {
    if (!Number.isFinite(nowMs)) {
      throw new RangeError('asset registry cache clock must be finite');
    }

    const key = assetRegistryCacheKey(scope);
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (!isAssetRegistryCacheEntryFresh(entry, scope, nowMs)) {
      this.entries.delete(key);
      return undefined;
    }
    return cloneAssetRegistryCacheEntry(entry);
  }

  public setWithTtl(
    scope: AssetRegistryCacheScope,
    value: T,
    ttlMs: number,
    nowMs: number = Date.now()
  ): AssetRegistryCacheEntry<T> {
    const expiresAtMs = nowMs + ttlMs;
    if (
      !Number.isFinite(nowMs) ||
      !Number.isFinite(ttlMs) ||
      ttlMs <= 0 ||
      !Number.isFinite(expiresAtMs)
    ) {
      throw new RangeError(
        'asset registry cache TTL requires finite nowMs and ttlMs > 0'
      );
    }

    const entry: AssetRegistryCacheEntry<T> = {
      scope: { ...scope },
      value,
      cachedAtMs: nowMs,
      expiresAtMs,
    };
    this.set(entry);
    return cloneAssetRegistryCacheEntry(entry);
  }
}

