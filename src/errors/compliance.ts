export type ComplianceBatchErrorCode =
  | 'INVALID_BATCH_INPUT'
  | 'BATCH_TOO_LARGE'
  | 'INVALID_BATCH_OPTIONS';

export class ComplianceBatchError extends Error {
  public readonly code: ComplianceBatchErrorCode;

  constructor(code: ComplianceBatchErrorCode, message: string) {
    super(message);
    this.name = 'ComplianceBatchError';
    this.code = code;
    Object.setPrototypeOf(this, ComplianceBatchError.prototype);
  }
}
