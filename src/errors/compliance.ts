export type ComplianceLifecycleErrorCode =
  | 'INVALID_ADDRESS'
  | 'SIGNER_REQUIRED'
  | 'ADMIN_UPDATE_UNSUPPORTED';

export type ComplianceLifecycleOperation = 'read' | 'admin-update';

export class ComplianceLifecycleError extends Error {
  public readonly code: ComplianceLifecycleErrorCode;
  public readonly operation: ComplianceLifecycleOperation;

  constructor(
    code: ComplianceLifecycleErrorCode,
    operation: ComplianceLifecycleOperation,
    message: string,
  ) {
    super(message);
    this.name = 'ComplianceLifecycleError';
    this.code = code;
    this.operation = operation;
    Object.setPrototypeOf(this, ComplianceLifecycleError.prototype);
  }
}
