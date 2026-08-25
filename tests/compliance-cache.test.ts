import { isComplianceCacheEntryFresh } from '../src';
import type {
  ComplianceCacheScope,
  ComplianceStatusCacheEntry,
} from '../src';

const scope: ComplianceCacheScope = {
  networkPassphrase: 'Test SDF Network ; September 2015',
  contractId: 'CAEGIS',
  address: 'GUSER',
};

function entry(
  overrides: Partial<ComplianceStatusCacheEntry> = {},
): ComplianceStatusCacheEntry {
  return {
    scope,
    isWhitelisted: true,
    checkedAt: 1_000,
    expiresAt: 2_000,
    ...overrides,
  };
}

describe('isComplianceCacheEntryFresh', () => {
  it('accepts an unexpired entry for the exact compliance scope', () => {
    expect(isComplianceCacheEntryFresh(entry(), scope, 1_999)).toBe(true);
  });

  it('expires an entry at the boundary instead of serving it stale', () => {
    expect(isComplianceCacheEntryFresh(entry(), scope, 2_000)).toBe(false);
  });

  it.each([
    [
      'network',
      {
        ...scope,
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
      },
    ],
    ['contract', { ...scope, contractId: 'COTHER' }],
    ['address', { ...scope, address: 'GOTHER' }],
  ])('rejects an entry from a different %s scope', (_field, expectedScope) => {
    expect(
      isComplianceCacheEntryFresh(entry(), expectedScope, 1_500),
    ).toBe(false);
  });

  it.each([
    ['future-dated check', entry({ checkedAt: 1_501 }), 1_500],
    ['non-finite check time', entry({ checkedAt: Number.NaN }), 1_500],
    ['non-finite expiry', entry({ expiresAt: Number.POSITIVE_INFINITY }), 1_500],
    ['non-finite current time', entry(), Number.NaN],
  ])('rejects a %s', (_case, candidate, now) => {
    expect(isComplianceCacheEntryFresh(candidate, scope, now)).toBe(false);
  });

  it('rejects an entry whose persisted scope is malformed', () => {
    const malformed = { ...entry(), scope: undefined };

    expect(
      isComplianceCacheEntryFresh(
        // @ts-expect-error persisted cache data may not match its declared type
        malformed,
        scope,
        1_500,
      ),
    ).toBe(false);
  });
});
