export type TransactionReconciliationErrorCode =
  | 'INVALID_TRANSACTION_HASH'
  | 'INVALID_STATUS'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_POLL_OPTIONS';

export class TransactionReconciliationError extends Error {
  public readonly code: TransactionReconciliationErrorCode;

  constructor(code: TransactionReconciliationErrorCode, message: string) {
    super(message);
    this.name = 'TransactionReconciliationError';
    this.code = code;
    Object.setPrototypeOf(this, TransactionReconciliationError.prototype);
  }
}
