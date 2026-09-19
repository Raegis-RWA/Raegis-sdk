/**
 * UI-facing investor eligibility standing.
 *
 * Distinct from `PortfolioStatus` (`active` / `empty` / …), which describes
 * portfolio holdings. These statuses explain *why* an investor can or cannot
 * participate from a compliance/whitelist perspective.
 *
 * IMPORTANT: Every explanation produced from these statuses is a dashboard UX
 * convenience derived from observable SDK signals. It is not legal, financial,
 * or regulatory advice, and it does not guarantee that a transaction will succeed.
 * The Aegis Soroban contract remains the final authority.
 */
export type InvestorEligibilityStatus =
  | 'approved'
  | 'blocked'
  | 'revoked'
  | 'unknown'
  | 'unavailable';

/**
 * Stable reason codes for eligibility explanations.
 *
 * Prefer these over free-text matching in dashboards. Unknown future values from
 * callers are normalised to `UNRECOGNIZED_STATUS` rather than implying approval.
 */
export type InvestorEligibilityReasonCode =
  | 'WHITELISTED'
  | 'NOT_WHITELISTED'
  | 'KYC_REVOKED'
  | 'COMPLIANCE_QUERY_FAILED'
  | 'INVALID_ADDRESS'
  | 'INSUFFICIENT_DATA'
  | 'UNRECOGNIZED_STATUS';

/**
 * Suggested next UI action. Never a legal instruction — dashboards use this to
 * choose a CTA (retry, open KYC flow, contact support), not to advise the user
 * on regulatory obligations.
 */
export type InvestorEligibilityNextAction =
  | 'none'
  | 'complete-kyc'
  | 'contact-compliance'
  | 'retry'
  | 'retry-with-backoff'
  | 'verify-address'
  | 'inspect-compliance-response';

/**
 * Inputs the mapper accepts. Prefer the most specific signal available.
 *
 * Priority when multiple signals are present:
 * 1. `invalidAddress`
 * 2. `complianceQueryFailed`
 * 3. `isKycRevoked`
 * 4. explicit `status`
 * 5. `isKycApproved`
 * 6. otherwise `unknown` / `INSUFFICIENT_DATA`
 *
 * `isKycRevoked` exists because `ComplianceModule.checkWhitelist()` only returns
 * a boolean today — it cannot distinguish "never approved" from "previously
 * approved then revoked". Callers that learn of a revoke from an admin receipt,
 * event, or off-chain KYC system can set this flag so the mapper emits `revoked`
 * instead of the more generic `blocked`.
 */
export interface InvestorEligibilityExplanationInput {
  address?: string;
  status?: InvestorEligibilityStatus | string;
  isKycApproved?: boolean;
  isKycRevoked?: boolean;
  complianceQueryFailed?: boolean;
  invalidAddress?: boolean;
  evaluatedAt?: Date | string;
}

/**
 * UI-friendly eligibility explanation.
 *
 * Results are frozen. `disclaimer` is always present so consumers cannot omit
 * the non-guarantee language when serialising for support tickets or dashboards.
 */
export interface InvestorEligibilityExplanation {
  address: string;
  status: InvestorEligibilityStatus;
  code: InvestorEligibilityReasonCode;
  /** Safe, user-facing summary. Contains no secrets or legal guarantees. */
  message: string;
  nextAction: InvestorEligibilityNextAction;
  isEligible: boolean;
  isKycApproved: boolean;
  /**
   * Always `false` today. Whitelist checks are observable signals, not a
   * simulated guarantee that a transfer or mint will succeed on-chain.
   */
  verified: boolean;
  /**
   * Fixed non-guarantee notice. Always present on every explanation so
   * dashboards and support tooling cannot drop the disclaimer by accident.
   */
  disclaimer: string;
  evaluatedAt: string;
}
