export type AssetTokenisationErrorCode =
  | 'INVALID_METADATA'
  | 'INVALID_ADDRESS'
  | 'INVALID_AMOUNT'
  | 'RPC_FAILURE'
  | 'INVALID_CONTRACT_RESPONSE';

export class AssetTokenisationError extends Error {
  public readonly code: AssetTokenisationErrorCode;
  public readonly cause?: Error;

  constructor(message: string, code: AssetTokenisationErrorCode, cause?: Error) {
    super(message);
    this.name = 'AssetTokenisationError';
    this.code = code;
    this.cause = cause;
    Object.setPrototypeOf(this, AssetTokenisationError.prototype);
  }
}
