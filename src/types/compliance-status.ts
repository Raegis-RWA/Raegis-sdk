/**
 * Protocol-facing compliance status labels used by the SDK transition mapper.
 *
 * These labels are descriptive application state, not legal determinations and
 * not on-chain authorization. The current contract whitelist query can only
 * directly distinguish an approved address from a non-approved/indeterminate
 * response; callers may supply the other explicit states from trusted protocol
 * or dashboard sources when available.
 */
export const COMPLIANCE_STATUSES = [
  'pending',
  'approved',
  'blocked',
  'revoked',
  'unknown',
  'unavailable',
] as const;

export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

export type ComplianceStatusObservationCode =
  | 'WHITELIST_APPROVED'
  | 'NOT_APPROVED_UNSPECIFIED'
  | 'QUERY_FAILED';

export interface ComplianceStatusSnapshot {
  address: string;
  status: ComplianceStatus;
  code: ComplianceStatusObservationCode;
  reason?: string;
  observedAt: string;
}

export type ComplianceTransitionKind =
  | 'initial'
  | 'unchanged'
  | 'progression'
  | 'restriction'
  | 'recovery'
  | 'indeterminate';

export type ComplianceTransitionCode =
  | 'INITIAL_STATUS'
  | 'NO_STATUS_CHANGE'
  | 'BECAME_APPROVED'
  | 'BECAME_RESTRICTED'
  | 'REVIEW_PENDING'
  | 'STATUS_UNKNOWN'
  | 'STATUS_UNAVAILABLE';

export interface ComplianceStatusTransition {
  from: ComplianceStatus | null;
  to: ComplianceStatus;
  kind: ComplianceTransitionKind;
  code: ComplianceTransitionCode;
  changed: boolean;
  /**
   * True when callers must not treat the mapped status as approved. This is a
   * fail-closed SDK signal only; false is not a transaction authorization.
   */
  failClosed: boolean;
  reason: string;
}
