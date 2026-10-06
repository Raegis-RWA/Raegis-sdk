export type AssetMetadataValidationCode =
  | 'INVALID_METADATA'
  | 'MISSING_FIELD'
  | 'INVALID_FIELD_TYPE'
  | 'INVALID_FIELD_VALUE';

export type AssetMetadataField =
  | 'metadata'
  | 'symbol'
  | 'name'
  | 'decimals'
  | 'isRwa'
  | 'category'
  | 'contractId';

export interface AssetMetadataValidationIssue {
  code: AssetMetadataValidationCode;
  field: AssetMetadataField;
  message: string;
}

/** Typed aggregate error for invalid RWA metadata. */
export class AssetMetadataValidationError extends Error {
  public readonly code = 'INVALID_ASSET_METADATA' as const;
  public readonly issues: readonly AssetMetadataValidationIssue[];

  constructor(issues: readonly AssetMetadataValidationIssue[]) {
    super(
      'Invalid RWA asset metadata: ' +
        issues.map((issue) => issue.field + ': ' + issue.message).join('; ')
    );
    this.name = 'AssetMetadataValidationError';
    this.issues = issues.map((issue) => ({ ...issue }));
    Object.setPrototypeOf(this, AssetMetadataValidationError.prototype);
  }
}
