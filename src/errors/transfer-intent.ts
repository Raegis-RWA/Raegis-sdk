export type CompliantTransferIntentErrorCode =
  | 'INVALID_RECIPIENT'
  | 'INVALID_AMOUNT'
  | 'INVALID_CONTRACT'
  | 'INVALID_NETWORK'
  | 'SENDER_NOT_COMPLIANT'
  | 'RECIPIENT_NOT_COMPLIANT'
  | 'COMPLIANCE_CHECK_FAILED'
  | 'INTENT_CONFIG_MISMATCH'
  | 'SUBMISSION_REJECTED'
  | 'SUBMISSION_UNCONFIRMED';

export class CompliantTransferIntentError extends Error {
  public readonly code: CompliantTransferIntentErrorCode;

  constructor(code: CompliantTransferIntentErrorCode, message: string) {
    super(message);
    this.name = 'CompliantTransferIntentError';
    this.code = code;
  }
}
