export const RWA_METADATA_SCHEMA_VERSION = 1 as const;

export const RWA_METADATA_LIMITS = {
  assetId: 128,
  name: 120,
  symbol: 32,
  description: 2048,
  metadataUri: 2048,
  decimalsMax: 18,
} as const;

export interface RwaAssetMetadata {
  schemaVersion: typeof RWA_METADATA_SCHEMA_VERSION;
  assetId: string;
  name: string;
  symbol: string;
  decimals: number;
  issuer: string;
  description?: string;
  metadataUri?: string;
}

export type RwaMetadataField =
  | 'schemaVersion'
  | 'assetId'
  | 'name'
  | 'symbol'
  | 'decimals'
  | 'issuer'
  | 'description'
  | 'metadataUri'
  | '$';

export type RwaMetadataValidationCode =
  | 'INVALID_OBJECT'
  | 'UNSUPPORTED_FIELD'
  | 'INVALID_SCHEMA_VERSION'
  | 'INVALID_ASSET_ID'
  | 'INVALID_NAME'
  | 'INVALID_SYMBOL'
  | 'INVALID_DECIMALS'
  | 'INVALID_ISSUER'
  | 'INVALID_DESCRIPTION'
  | 'INVALID_METADATA_URI';

export interface RwaMetadataValidationIssue {
  field: RwaMetadataField | string;
  code: RwaMetadataValidationCode;
  message: string;
}

export type RwaMetadataValidationResult =
  | {
      ok: true;
      value: RwaAssetMetadata;
      issues: readonly [];
    }
  | {
      ok: false;
      issues: readonly RwaMetadataValidationIssue[];
    };
