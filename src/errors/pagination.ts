export type PaginationValidationCode = 'INVALID_CURSOR' | 'INVALID_LIMIT';

export class PaginationValidationError extends Error {
  public readonly code: PaginationValidationCode;
  public readonly field: 'cursor' | 'limit';

  constructor(
    code: PaginationValidationCode,
    field: 'cursor' | 'limit',
    message: string
  ) {
    super(message);
    this.name = 'PaginationValidationError';
    this.code = code;
    this.field = field;
  }
}
