export type AssetMetadataField =
  | 'metadata'
  | 'issuer'
  | 'symbol'
  | 'name'
  | 'status'
  | 'supply';

export type AssetMetadataErrorCode =
  | 'INVALID_METADATA'
  | 'INVALID_ISSUER'
  | 'INVALID_SYMBOL'
  | 'INVALID_NAME'
  | 'INVALID_STATUS'
  | 'INVALID_SUPPLY';

/**
 * Stable validation error for RWA metadata boundaries.
 *
 * Consumers can branch on `code`/`field` without parsing display text.
 */
export class AssetMetadataValidationError extends Error {
  public readonly code: AssetMetadataErrorCode;
  public readonly field: AssetMetadataField;

  constructor(
    message: string,
    code: AssetMetadataErrorCode,
    field: AssetMetadataField
  ) {
    super(message);
    this.name = 'AssetMetadataValidationError';
    this.code = code;
    this.field = field;
    Object.setPrototypeOf(this, AssetMetadataValidationError.prototype);
  }
}
