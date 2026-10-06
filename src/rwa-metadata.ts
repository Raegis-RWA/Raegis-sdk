import { StrKey } from '@stellar/stellar-sdk';
import { RwaMetadataValidationError } from './errors/rwa-metadata';
import {
  RWA_METADATA_LIMITS,
  RWA_METADATA_SCHEMA_VERSION,
  RwaAssetMetadata,
  RwaMetadataValidationIssue,
  RwaMetadataValidationResult,
} from './types/rwa-metadata';

const KNOWN_FIELDS = new Set([
  'schemaVersion',
  'assetId',
  'name',
  'symbol',
  'decimals',
  'issuer',
  'description',
  'metadataUri',
]);

const ASSET_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const SYMBOL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const UNSAFE_CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim() &&
    !UNSAFE_CONTROL_RE.test(value)
  );
}

function isAllowedMetadataUri(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > RWA_METADATA_LIMITS.metadataUri ||
    value !== value.trim()
  ) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'ipfs:') &&
      parsed.hostname.length > 0
    );
  } catch {
    return false;
  }
}

export function validateRwaMetadata(input: unknown): RwaMetadataValidationResult {
  if (!isPlainRecord(input)) {
    return {
      ok: false,
      issues: [{ field: '$', code: 'INVALID_OBJECT', message: 'metadata must be a plain object' }],
    };
  }

  const issues: RwaMetadataValidationIssue[] = [];

  for (const field of Object.keys(input)) {
    if (!KNOWN_FIELDS.has(field)) {
      issues.push({
        field,
        code: 'UNSUPPORTED_FIELD',
        message: `unsupported metadata field "${field}"`,
      });
    }
  }

  if (input.schemaVersion !== RWA_METADATA_SCHEMA_VERSION) {
    issues.push({
      field: 'schemaVersion',
      code: 'INVALID_SCHEMA_VERSION',
      message: `schemaVersion must be ${RWA_METADATA_SCHEMA_VERSION}`,
    });
  }

  if (
    !isBoundedText(input.assetId, RWA_METADATA_LIMITS.assetId) ||
    !ASSET_ID_RE.test(input.assetId)
  ) {
    issues.push({
      field: 'assetId',
      code: 'INVALID_ASSET_ID',
      message: 'assetId must start with an alphanumeric character and use only letters, digits, ".", "_", ":", or "-"',
    });
  }

  if (!isBoundedText(input.name, RWA_METADATA_LIMITS.name)) {
    issues.push({
      field: 'name',
      code: 'INVALID_NAME',
      message: `name must be trimmed text between 1 and ${RWA_METADATA_LIMITS.name} characters`,
    });
  }

  if (
    !isBoundedText(input.symbol, RWA_METADATA_LIMITS.symbol) ||
    !SYMBOL_RE.test(input.symbol)
  ) {
    issues.push({
      field: 'symbol',
      code: 'INVALID_SYMBOL',
      message: 'symbol must start with an alphanumeric character and use only letters, digits, ".", "_", or "-"',
    });
  }

  if (
    !Number.isInteger(input.decimals) ||
    (input.decimals as number) < 0 ||
    (input.decimals as number) > RWA_METADATA_LIMITS.decimalsMax
  ) {
    issues.push({
      field: 'decimals',
      code: 'INVALID_DECIMALS',
      message: `decimals must be an integer from 0 through ${RWA_METADATA_LIMITS.decimalsMax}`,
    });
  }

  if (typeof input.issuer !== 'string' || !StrKey.isValidEd25519PublicKey(input.issuer)) {
    issues.push({
      field: 'issuer',
      code: 'INVALID_ISSUER',
      message: 'issuer must be a valid Stellar ed25519 public key',
    });
  }

  if (
    input.description !== undefined &&
    !isBoundedText(input.description, RWA_METADATA_LIMITS.description)
  ) {
    issues.push({
      field: 'description',
      code: 'INVALID_DESCRIPTION',
      message: `description must be trimmed text between 1 and ${RWA_METADATA_LIMITS.description} characters when provided`,
    });
  }

  if (input.metadataUri !== undefined && !isAllowedMetadataUri(input.metadataUri)) {
    issues.push({
      field: 'metadataUri',
      code: 'INVALID_METADATA_URI',
      message: 'metadataUri must be an https:// or ipfs:// URI',
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    issues: [],
    value: {
      schemaVersion: RWA_METADATA_SCHEMA_VERSION,
      assetId: input.assetId as string,
      name: input.name as string,
      symbol: input.symbol as string,
      decimals: input.decimals as number,
      issuer: input.issuer as string,
      ...(input.description === undefined ? {} : { description: input.description as string }),
      ...(input.metadataUri === undefined ? {} : { metadataUri: input.metadataUri as string }),
    },
  };
}

export function assertRwaMetadata(input: unknown): RwaAssetMetadata {
  const result = validateRwaMetadata(input);
  if (!result.ok) {
    throw new RwaMetadataValidationError(result.issues);
  }
  return result.value;
}
