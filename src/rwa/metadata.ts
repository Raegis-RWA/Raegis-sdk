import { Keypair } from '@stellar/stellar-sdk';
import {
  AssetMetadataErrorCode,
  AssetMetadataField,
  AssetMetadataValidationError,
} from '../errors/asset-metadata';
import {
  RWA_ASSET_STATUSES,
  RwaAssetMetadata,
  RwaAssetStatus,
} from '../types/asset-metadata';

const SYMBOL_PATTERN = /^[A-Za-z0-9]{2,10}(-[A-Za-z0-9]{2,10})?$/;
const STELLAR_ACCOUNT_PATTERN = /^G[A-Z2-7]{55}$/;
const MAX_I128 = (1n << 127n) - 1n;
const MAX_I128_DECIMAL = MAX_I128.toString();
const STATUS_SET = new Set<string>(RWA_ASSET_STATUSES);
type MetadataField = Exclude<AssetMetadataField, 'metadata'>;

function fail(
  field: AssetMetadataField,
  code: AssetMetadataErrorCode,
  message: string
): never {
  throw new AssetMetadataValidationError(message, code, field);
}

function objectInput(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null) {
    return fail('metadata', 'INVALID_METADATA', 'metadata must be an object');
  }

  let isArray: boolean;
  try {
    isArray = Array.isArray(input);
  } catch {
    return fail('metadata', 'INVALID_METADATA', 'metadata must be an object');
  }

  if (isArray) {
    return fail('metadata', 'INVALID_METADATA', 'metadata must be an object');
  }
  return input as Record<string, unknown>;
}

function ownDataField(
  metadata: Record<string, unknown>,
  field: MetadataField
): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(metadata, field);
    if (!descriptor) {
      return undefined;
    }
    if (!('value' in descriptor)) {
      return fail(
        'metadata',
        'INVALID_METADATA',
        'metadata fields must be readable data properties'
      );
    }
    return descriptor.value;
  } catch {
    return fail(
      'metadata',
      'INVALID_METADATA',
      'metadata fields must be readable data properties'
    );
  }
}

function issuer(value: unknown): string {
  if (typeof value !== 'string') {
    return fail('issuer', 'INVALID_ISSUER', 'issuer has an invalid account format');
  }

  const normalized = value.trim();
  if (!STELLAR_ACCOUNT_PATTERN.test(normalized)) {
    return fail('issuer', 'INVALID_ISSUER', 'issuer has an invalid account format');
  }

  try {
    Keypair.fromPublicKey(normalized);
  } catch {
    return fail('issuer', 'INVALID_ISSUER', 'issuer has an invalid Stellar StrKey checksum');
  }

  return normalized;
}

function symbol(value: unknown): string {
  if (typeof value !== 'string') {
    return fail('symbol', 'INVALID_SYMBOL', 'symbol must be a string');
  }
  const trimmed = value.trim();
  if (!SYMBOL_PATTERN.test(trimmed)) {
    return fail('symbol', 'INVALID_SYMBOL', 'symbol has an invalid format');
  }
  return trimmed.toUpperCase();
}

function name(value: unknown): string {
  if (typeof value !== 'string') {
    return fail('name', 'INVALID_NAME', 'name must be a string');
  }
  const normalized = value.trim();
  let characterCount = 0;
  for (const _character of normalized) {
    characterCount += 1;
    if (characterCount > 128) {
      break;
    }
  }
  if (characterCount < 3 || characterCount > 128) {
    return fail('name', 'INVALID_NAME', 'name must contain 3-128 characters');
  }
  return normalized;
}

function status(value: unknown): RwaAssetStatus {
  if (typeof value !== 'string' || !STATUS_SET.has(value)) {
    return fail('status', 'INVALID_STATUS', 'status is not recognized');
  }
  return value as RwaAssetStatus;
}

function supply(value: unknown): bigint {
  let normalized: bigint;

  if (typeof value === 'bigint') {
    normalized = value;
  } else if (typeof value === 'string') {
    const decimal = value.trim();
    if (!/^\d+$/.test(decimal)) {
      return fail('supply', 'INVALID_SUPPLY', 'supply must be an unsigned exact integer');
    }

    const canonicalDecimal = decimal.replace(/^0+(?=\d)/, '');
    if (
      canonicalDecimal.length > MAX_I128_DECIMAL.length ||
      (canonicalDecimal.length === MAX_I128_DECIMAL.length &&
        canonicalDecimal > MAX_I128_DECIMAL)
    ) {
      return fail('supply', 'INVALID_SUPPLY', 'supply is outside the supported i128 range');
    }
    normalized = BigInt(canonicalDecimal);
  } else if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    normalized = BigInt(value);
  } else {
    return fail('supply', 'INVALID_SUPPLY', 'supply must be an unsigned exact integer');
  }

  if (normalized < 0n || normalized > MAX_I128) {
    return fail('supply', 'INVALID_SUPPLY', 'supply is outside the supported i128 range');
  }
  return normalized;
}

export function parseRwaAssetMetadata(input: unknown): RwaAssetMetadata {
  const metadata = objectInput(input);
  return {
    issuer: issuer(ownDataField(metadata, 'issuer')),
    symbol: symbol(ownDataField(metadata, 'symbol')),
    name: name(ownDataField(metadata, 'name')),
    status: status(ownDataField(metadata, 'status')),
    supply: supply(ownDataField(metadata, 'supply')),
  };
}

export type RwaAssetMetadataParseResult =
  | { success: true; data: RwaAssetMetadata }
  | { success: false; error: AssetMetadataValidationError };

export const rwaAssetMetadataSchema = {
  parse: parseRwaAssetMetadata,
  safeParse(input: unknown): RwaAssetMetadataParseResult {
    try {
      return { success: true, data: parseRwaAssetMetadata(input) };
    } catch (error) {
      if (error instanceof AssetMetadataValidationError) {
        return { success: false, error };
      }
      throw error;
    }
  },
};

