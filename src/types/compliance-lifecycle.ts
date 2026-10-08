export type ComplianceLifecycleStatus =
  | 'approved'
  | 'not-approved'
  | 'unavailable';

export type ComplianceLifecycleCode =
  | 'WHITELIST_APPROVED'
  | 'WHITELIST_NOT_APPROVED'
  | 'READ_UNAVAILABLE';

export interface ComplianceStatusSnapshot {
  address: string;
  status: ComplianceLifecycleStatus;
  code: ComplianceLifecycleCode;
  /** True/false only when the current protocol whitelist state was observed. */
  eligible: boolean | null;
  observedAt: string;
}

export interface ComplianceLifecycleDiagnostic {
  module: 'available';
  read: {
    supported: true;
    contractMethod: 'is_whitelisted';
  };
  adminUpdate: {
    supported: false;
    requiresSigner: true;
    reasonCode: 'CONTRACT_WRITE_METHOD_UNAVAILABLE';
  };
  signerConfigured: boolean;
  legalStatus: 'not-assessed';
}
