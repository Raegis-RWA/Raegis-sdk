export type EligibilityExplanationErrorCode =
  | 'INVALID_ADDRESS'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_INPUT';

export class EligibilityExplanationError extends Error {
  public readonly code: EligibilityExplanationErrorCode;

  constructor(code: EligibilityExplanationErrorCode, message: string) {
    super(message);
    this.name = 'EligibilityExplanationError';
    this.code = code;
    Object.setPrototypeOf(this, EligibilityExplanationError.prototype);
  }
}
