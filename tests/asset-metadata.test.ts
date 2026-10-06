import {
  isAssetMetadata,
  parseAssetMetadata,
  safeParseAssetMetadata,
} from '../src/asset-metadata';
import { AssetMetadataValidationError } from '../src/errors/asset-metadata';
import {
  invalidRwaAssetMetadataFixtures,
  minimalRwaAssetMetadataFixture,
  validRwaAssetMetadataFixture,
} from './fixtures/asset-metadata';

describe('RWA asset metadata parser', () => {
  it('parses and normalizes the canonical metadata shape', () => {
    expect(parseAssetMetadata(validRwaAssetMetadataFixture)).toEqual({
      symbol: 'AEGIS-RWA',
      name: 'Aegis Tokenized Real Estate',
      decimals: 7,
      isRwa: true,
      category: 'Real Estate',
      contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
    });
  });

  it('accepts metadata without optional fields', () => {
    expect(parseAssetMetadata(minimalRwaAssetMetadataFixture)).toEqual(
      minimalRwaAssetMetadataFixture
    );
  });

  it('returns typed issues for missing and invalid required fields', () => {
    const result = safeParseAssetMetadata(
      invalidRwaAssetMetadataFixtures.missingAndInvalidRequired
    );

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected invalid metadata');

    expect(result.error).toBeInstanceOf(AssetMetadataValidationError);
    expect(result.error.code).toBe('INVALID_ASSET_METADATA');
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'symbol', code: 'INVALID_FIELD_VALUE' }),
        expect.objectContaining({ field: 'name', code: 'MISSING_FIELD' }),
        expect.objectContaining({ field: 'decimals', code: 'INVALID_FIELD_VALUE' }),
        expect.objectContaining({ field: 'isRwa', code: 'INVALID_FIELD_TYPE' }),
      ])
    );
  });

  it('validates optional metadata fields when they are present', () => {
    const result = safeParseAssetMetadata(
      invalidRwaAssetMetadataFixtures.invalidOptionalFields
    );

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected invalid metadata');

    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'category', code: 'INVALID_FIELD_VALUE' }),
        expect.objectContaining({ field: 'contractId', code: 'INVALID_FIELD_TYPE' }),
      ])
    );
  });

  it('rejects non-object inputs and exposes a matching runtime type guard', () => {
    expect(() => parseAssetMetadata([])).toThrow(AssetMetadataValidationError);
    expect(isAssetMetadata(null)).toBe(false);
    expect(isAssetMetadata(validRwaAssetMetadataFixture)).toBe(true);
  });
});
