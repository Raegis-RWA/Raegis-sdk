/**
 * Identifies the exact compliance read represented by a cache entry.
 *
 * All three fields are required to prevent status reuse across networks,
 * contract deployments, or accounts.
 */
export interface ComplianceCacheScope {
  readonly networkPassphrase: string;
  readonly contractId: string;
  readonly address: string;
}

/**
 * A consumer-managed snapshot of `ComplianceModule.checkWhitelist()`.
 * Timestamps are Unix epoch milliseconds.
 */
export interface ComplianceStatusCacheEntry {
  readonly scope: ComplianceCacheScope;
  readonly isWhitelisted: boolean;
  readonly checkedAt: number;
  readonly expiresAt: number;
}

/**
 * Optional storage boundary for dashboards that cache compliance reads.
 * The SDK does not create or invoke an adapter automatically.
 */
export interface ComplianceStatusCacheAdapter {
  get(
    scope: Readonly<ComplianceCacheScope>,
  ):
    | ComplianceStatusCacheEntry
    | undefined
    | Promise<ComplianceStatusCacheEntry | undefined>;
  set(entry: Readonly<ComplianceStatusCacheEntry>): void | Promise<void>;
  invalidate(scope: Readonly<ComplianceCacheScope>): void | Promise<void>;
}
