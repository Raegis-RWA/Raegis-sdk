import { AssetMetadata } from './types/portfolio';
import {
  AssetMetadataValidationError,
  AssetMetadataValidationIssue,
} from './errors/asset-metadata';

type MetadataRecord = Record<string, unknown>;

export type SafeAssetMetadataParseResult =
  | { success: true; data: AssetMetadata }
  | { success: false; error: AssetMetadataValidationError };

function isRecord(value: unknown): value is MetadataRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(record: MetadataRecord, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

function requiredString(
  record: MetadataRecord,
  field: 'symbol' | 'name',
  issues: AssetMetadataValidationIssue[]
): string | undefined {
  if (!hasOwn(record, field) || record[field] === undefined) {
    issues.push({ code: 'MISSING_FIELD', field, message: field + ' is required.' });
    return undefined;
  }
  const value = record[field];
  if (typeof value !== 'string') {
    issues.push({ code: 'INVALID_FIELD_TYPE', field, message: field + ' must be a string.' });
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) {
    issues.push({ code: 'INVALID_FIELD_VALUE', field, message: field + ' must not be empty.' });
    return undefined;
  }
  return normalized;
}

function optionalString(
  record: MetadataRecord,
  field: 'category' | 'contractId',
  issues: AssetMetadataValidationIssue[]
): string | undefined {
  if (!hasOwn(record, field) || record[field] === undefined) return undefined;
  const value = record[field];
  if (typeof value !== 'string') {
    issues.push({
      code: 'INVALID_FIELD_TYPE',
      field,
      message: field + ' must be a string when provided.',
    });
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) {
    issues.push({
      code: 'INVALID_FIELD_VALUE',
      field,
      message: field + ' must not be empty when provided.',
    });
    return undefined;
  }
  return normalized;
}

/**
 * Parses unknown input into the SDK's canonical RWA asset metadata shape.
 * This validates metadata structure only; it does not establish contract,
 * issuer, compliance, or legal state.
 */
export function parseAssetMetadata(input: unknown): AssetMetadata {
  if (!isRecord(input)) {
    throw new AssetMetadataValidationError([
      {
        code: 'INVALID_METADATA',
        field: 'metadata',
        message: 'metadata must be a non-array object.',
      },
    ]);
  }

  const issues: AssetMetadataValidationIssue[] = [];
  const symbol = requiredString(input, 'symbol', issues);
  const name = requiredString(input, 'name', issues);

  let decimals: number | undefined;
  if (!hasOwn(input, 'decimals') || input.decimals === undefined) {
    issues.push({ code: 'MISSING_FIELD', field: 'decimals', message: 'decimals is required.' });
  } else if (typeof input.decimals !== 'number') {
    issues.push({
      code: 'INVALID_FIELD_TYPE',
      field: 'decimals',
      message: 'decimals must be a number.',
    });
  } else if (!Number.isSafeInteger(input.decimals) || input.decimals < 0) {
    issues.push({
      code: 'INVALID_FIELD_VALUE',
      field: 'decimals',
      message: 'decimals must be a non-negative safe integer.',
    });
  } else {
    decimals = input.decimals;
  }

  let isRwa: boolean | undefined;
  if (!hasOwn(input, 'isRwa') || input.isRwa === undefined) {
    issues.push({ code: 'MISSING_FIELD', field: 'isRwa', message: 'isRwa is required.' });
  } else if (typeof input.isRwa !== 'boolean') {
    issues.push({
      code: 'INVALID_FIELD_TYPE',
      field: 'isRwa',
      message: 'isRwa must be a boolean.',
    });
  } else {
    isRwa = input.isRwa;
  }

  const category = optionalString(input, 'category', issues);
  const contractId = optionalString(input, 'contractId', issues);

  if (issues.length > 0) throw new AssetMetadataValidationError(issues);

  const parsed: AssetMetadata = {
    symbol: symbol!,
    name: name!,
    decimals: decimals!,
    isRwa: isRwa!,
  };
  if (category !== undefined) parsed.category = category;
  if (contractId !== undefined) parsed.contractId = contractId;
  return parsed;
}

export function safeParseAssetMetadata(input: unknown): SafeAssetMetadataParseResult {
  try {
    return { success: true, data: parseAssetMetadata(input) };
  } catch (error) {
    if (error instanceof AssetMetadataValidationError) {
      return { success: false, error };
    }
    throw error;
  }
}

export function isAssetMetadata(input: unknown): input is AssetMetadata {
  return safeParseAssetMetadata(input).success;
}
