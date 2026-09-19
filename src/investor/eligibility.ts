import { EligibilityExplanationError } from '../errors/eligibility';
import {
  InvestorEligibilityExplanation,
  InvestorEligibilityExplanationInput,
  InvestorEligibilityNextAction,
  InvestorEligibilityReasonCode,
  InvestorEligibilityStatus,
} from '../types/eligibility';

export const ELIGIBILITY_DISCLAIMER =
  'This explanation is a dashboard UX signal derived from SDK-observable ' +
  'compliance data. It is not legal, financial, or regulatory advice, and it ' +
  'does not guarantee that a transaction will succeed. The Aegis Soroban ' +
  'contract remains the final authority.';

interface EligibilityMapping {
  status: InvestorEligibilityStatus;
  code: InvestorEligibilityReasonCode;
  message: string;
  nextAction: InvestorEligibilityNextAction;
  isEligible: boolean;
  isKycApproved: boolean;
}

const STATUS_ALIASES: Readonly<Record<string, InvestorEligibilityStatus>> = {
  APPROVED: 'approved',
  ELIGIBLE: 'approved',
  WHITELISTED: 'approved',
  SUCCESS: 'approved',
  BLOCKED: 'blocked',
  DENIED: 'blocked',
  NOT_WHITELISTED: 'blocked',
  UNAUTHORIZED: 'blocked',
  REVOKED: 'revoked',
  KYC_REVOKED: 'revoked',
  UNKNOWN: 'unknown',
  UNAVAILABLE: 'unavailable',
};

const STATUS_MAPPINGS: Readonly<
  Record<InvestorEligibilityStatus, EligibilityMapping>
> = {
  approved: {
    status: 'approved',
    code: 'WHITELISTED',
    message:
      'Address appears on the protocol whitelist and is currently treated as eligible for whitelist-gated actions.',
    nextAction: 'none',
    isEligible: true,
    isKycApproved: true,
  },
  blocked: {
    status: 'blocked',
    code: 'NOT_WHITELISTED',
    message:
      'Address is not on the protocol whitelist, so whitelist-gated actions are expected to be blocked.',
    nextAction: 'complete-kyc',
    isEligible: false,
    isKycApproved: false,
  },
  revoked: {
    status: 'revoked',
    code: 'KYC_REVOKED',
    message:
      'Previously granted whitelist standing appears to have been revoked. Whitelist-gated actions are expected to be blocked.',
    nextAction: 'contact-compliance',
    isEligible: false,
    isKycApproved: false,
  },
  unknown: {
    status: 'unknown',
    code: 'INSUFFICIENT_DATA',
    message:
      'Eligibility could not be determined from the available signals. Treat the outcome as indeterminate.',
    nextAction: 'inspect-compliance-response',
    isEligible: false,
    isKycApproved: false,
  },
  unavailable: {
    status: 'unavailable',
    code: 'COMPLIANCE_QUERY_FAILED',
    message:
      'Eligibility could not be evaluated because the compliance signal is unavailable.',
    nextAction: 'retry-with-backoff',
    isEligible: false,
    isKycApproved: false,
  },
};

/**
 * Normalises a raw status string into a stable eligibility status.
 * Unrecognised values resolve to `unknown` rather than implying approval.
 */
export function normalizeInvestorEligibilityStatus(
  status: string,
): InvestorEligibilityStatus {
  const normalized = status.trim().toUpperCase();
  return STATUS_ALIASES[normalized] ?? 'unknown';
}

/**
 * Builds a UI-friendly eligibility explanation from observable compliance signals.
 *
 * Messages are fixed, safe strings — raw RPC errors, URLs, and credentials are
 * never copied. Every result includes {@link ELIGIBILITY_DISCLAIMER}.
 */
export function buildInvestorEligibilityExplanation(
  input: InvestorEligibilityExplanationInput = {},
): InvestorEligibilityExplanation {
  const mapping = resolveMapping(input);
  const address =
    typeof input.address === 'string' ? input.address.trim() : '';

  return Object.freeze({
    address,
    status: mapping.status,
    code: mapping.code,
    message: mapping.message,
    nextAction: mapping.nextAction,
    isEligible: mapping.isEligible,
    isKycApproved: mapping.isKycApproved,
    verified: false,
    disclaimer: ELIGIBILITY_DISCLAIMER,
    evaluatedAt: normalizeEvaluatedAt(input.evaluatedAt),
  });
}

/**
 * Convenience: map a boolean whitelist result into an explanation.
 *
 * A bare `false` becomes `blocked`, not `revoked`. Pass `isKycRevoked: true`
 * through {@link buildInvestorEligibilityExplanation} when revoke is known.
 */
export function explainWhitelistResult(
  isKycApproved: boolean,
  options: Omit<InvestorEligibilityExplanationInput, 'isKycApproved'> = {},
): InvestorEligibilityExplanation {
  return buildInvestorEligibilityExplanation({
    ...options,
    isKycApproved,
  });
}

function resolveMapping(
  input: InvestorEligibilityExplanationInput,
): EligibilityMapping {
  if (input.invalidAddress === true) {
    return {
      status: 'unavailable',
      code: 'INVALID_ADDRESS',
      message:
        'Eligibility could not be evaluated because the address is missing or invalid.',
      nextAction: 'verify-address',
      isEligible: false,
      isKycApproved: false,
    };
  }

  if (input.complianceQueryFailed === true) {
    return {
      ...STATUS_MAPPINGS.unavailable,
      code: 'COMPLIANCE_QUERY_FAILED',
      nextAction: 'retry-with-backoff',
    };
  }

  if (input.isKycRevoked === true) {
    return STATUS_MAPPINGS.revoked;
  }

  if (typeof input.status === 'string' && input.status.trim()) {
    const status = normalizeInvestorEligibilityStatus(input.status);
    if (status === 'unknown' && !STATUS_ALIASES[input.status.trim().toUpperCase()]) {
      return {
        ...STATUS_MAPPINGS.unknown,
        code: 'UNRECOGNIZED_STATUS',
        message:
          'Reported eligibility status is not recognised by this SDK version and is treated as indeterminate.',
      };
    }
    return STATUS_MAPPINGS[status];
  }

  if (typeof input.isKycApproved === 'boolean') {
    return input.isKycApproved
      ? STATUS_MAPPINGS.approved
      : STATUS_MAPPINGS.blocked;
  }

  return STATUS_MAPPINGS.unknown;
}

function normalizeEvaluatedAt(evaluatedAt?: Date | string): string {
  const date =
    evaluatedAt instanceof Date
      ? evaluatedAt
      : new Date(evaluatedAt ?? Date.now());

  if (Number.isNaN(date.getTime())) {
    throw new EligibilityExplanationError(
      'INVALID_TIMESTAMP',
      'Evaluation timestamp must be a valid date.',
    );
  }

  return date.toISOString();
}
