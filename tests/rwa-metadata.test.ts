import { Keypair } from '@stellar/stellar-sdk';
import {
  assertRwaMetadata,
  RwaMetadataValidationError,
  validateRwaMetadata,
} from '../src';

function validMetadata() {
  return {
    schemaVersion: 1 as const,
    assetId: 'rwa:property:001',
    name: 'Harbor Street Property',
    symbol: 'HSP',
    decimals: 7,
    issuer: Keypair.random().publicKey(),
    description: 'Versioned off-chain metadata for a tokenized asset.',
    metadataUri: 'https://example.com/assets/001.json',
  };
}

describe('RWA metadata validation', () => {
  it('accepts the version-1 core schema and returns a typed value', () => {
    const input = validMetadata();
    const result = validateRwaMetadata(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toEqual(input);
    expect(result.value.decimals).toBe(7);
  });

  it('accepts both HTTPS and IPFS metadata references', () => {
    const https = validateRwaMetadata(validMetadata());
    const ipfs = validateRwaMetadata({
      ...validMetadata(),
      metadataUri: 'ipfs://bafybeigdyrzt/metadata.json',
    });

    expect(https.ok).toBe(true);
    expect(ipfs.ok).toBe(true);
  });

  it('rejects invalid identifiers, decimals, issuer, URI, and schema version with stable codes', () => {
    const result = validateRwaMetadata({
      ...validMetadata(),
      schemaVersion: 2,
      assetId: ' bad asset ',
      symbol: 'BAD SYMBOL',
      decimals: 19,
      issuer: 'not-a-stellar-key',
      metadataUri: 'http://example.com/metadata.json',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'INVALID_SCHEMA_VERSION',
        'INVALID_ASSET_ID',
        'INVALID_SYMBOL',
        'INVALID_DECIMALS',
        'INVALID_ISSUER',
        'INVALID_METADATA_URI',
      ])
    );
  });

  it('rejects unknown top-level fields instead of silently widening the schema', () => {
    const result = validateRwaMetadata({
      ...validMetadata(),
      legalStatus: 'approved',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        field: 'legalStatus',
        code: 'UNSUPPORTED_FIELD',
      })
    );
  });

  it('enforces trimmed bounded text and decimals boundary values', () => {
    expect(validateRwaMetadata({ ...validMetadata(), decimals: 0 }).ok).toBe(true);
    expect(validateRwaMetadata({ ...validMetadata(), decimals: 18 }).ok).toBe(true);

    const whitespace = validateRwaMetadata({
      ...validMetadata(),
      name: ' leading space',
    });
    const control = validateRwaMetadata({
      ...validMetadata(),
      description: 'unsafe\u0007control',
    });

    expect(whitespace.ok).toBe(false);
    expect(control.ok).toBe(false);
  });

  it('assert helper throws the typed error with machine-readable issues', () => {
    try {
      assertRwaMetadata({ ...validMetadata(), issuer: 'invalid' });
      throw new Error('expected assertRwaMetadata to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(RwaMetadataValidationError);
      expect((error as RwaMetadataValidationError).issues).toContainEqual(
        expect.objectContaining({ code: 'INVALID_ISSUER', field: 'issuer' })
      );
    }
  });
});
