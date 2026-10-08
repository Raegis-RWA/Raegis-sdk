/** Protocol-facing readiness state for restricted Raegis operations. */
export type ComplianceReadinessState =
  | 'approved'
  | 'blocked'
  | 'revoked'
  | 'pending'
  | 'unknown'
  | 'unavailable';

/** Stable reason codes suitable for dashboard logic and support diagnostics. */
export type ComplianceReadinessReasonCode =
  | 'APPROVED'
  | 'NOT_WHITELISTED'
  | 'REVOKED'
  | 'PENDING_REVIEW'
  | 'STATUS_UNKNOWN'
  | 'STATUS_UNAVAILABLE'
  | 'INVALID_ADDRESS';

/**
 * Protocol status values accepted by the normaliser.
 *
 * The deployed contract currently exposes a boolean `is_whitelisted` read.
 * String states keep the public SDK model forward-compatible with richer
 * protocol/indexer status sources without changing dashboard state handling.
 */
export type ComplianceProtocolStatus =
  | boolean
  | 'approved'
  | 'whitelisted'
  | 'blocked'
  | 'not_whitelisted'
  | 'revoked'
  | 'pending'
  | 'unknown'
  | 'unavailable'
  | null
  | undefined;

export interface ComplianceReadinessResult {
  address: string;
  state: ComplianceReadinessState;
  /** True only when the observed protocol state allows a restricted action. */
  eligible: boolean;
  /** True when the state came from a successful protocol status read. */
  verified: boolean;
  code: ComplianceReadinessReasonCode;
  reason: string;
  checkedAt: string;
}
