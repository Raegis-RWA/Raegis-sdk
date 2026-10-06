import {
  COMPLIANCE_STATUSES,
  ComplianceStatus,
  ComplianceStatusTransition,
} from './types/compliance-status';

const KNOWN_COMPLIANCE_STATUSES = new Set<string>(COMPLIANCE_STATUSES);

/**
 * Normalizes an untrusted status label into the SDK's closed status set.
 * Unknown or malformed values fail closed to `unknown`.
 */
export function normalizeComplianceStatus(value: unknown): ComplianceStatus {
  if (typeof value !== 'string') return 'unknown';
  const normalized = value.trim().toLowerCase();
  return KNOWN_COMPLIANCE_STATUSES.has(normalized)
    ? (normalized as ComplianceStatus)
    : 'unknown';
}

/**
 * Maps a previous/current protocol compliance status into a stable transition.
 *
 * This function is deliberately pure. It does not mutate compliance state,
 * infer legal/KYC conclusions, or replace contract authorization checks.
 */
export function mapComplianceStatusTransition(
  previous: ComplianceStatus | null | undefined,
  current: ComplianceStatus,
): ComplianceStatusTransition {
  const from = previous == null ? null : normalizeComplianceStatus(previous);
  const to = normalizeComplianceStatus(current);
  const changed = from !== to;

  if (from === null) {
    return {
      from,
      to,
      kind: to === 'unknown' || to === 'unavailable' ? 'indeterminate' : 'initial',
      code:
        to === 'unknown'
          ? 'STATUS_UNKNOWN'
          : to === 'unavailable'
            ? 'STATUS_UNAVAILABLE'
            : to === 'pending'
              ? 'REVIEW_PENDING'
              : 'INITIAL_STATUS',
      changed: true,
      failClosed: to !== 'approved',
      reason: `Initial compliance status is ${to}.`,
    };
  }

  if (to === 'unknown') {
    return {
      from,
      to,
      kind: 'indeterminate',
      code: 'STATUS_UNKNOWN',
      changed,
      failClosed: true,
      reason: 'Current compliance status is unknown; do not infer approval.',
    };
  }

  if (to === 'unavailable') {
    return {
      from,
      to,
      kind: 'indeterminate',
      code: 'STATUS_UNAVAILABLE',
      changed,
      failClosed: true,
      reason: 'Compliance status could not be observed; do not infer approval.',
    };
  }

  if (from === to) {
    return {
      from,
      to,
      kind: 'unchanged',
      code: 'NO_STATUS_CHANGE',
      changed: false,
      failClosed: to !== 'approved',
      reason: `Compliance status remains ${to}.`,
    };
  }

  if (to === 'approved') {
    return {
      from,
      to,
      kind: from === 'blocked' || from === 'revoked' ? 'recovery' : 'progression',
      code: 'BECAME_APPROVED',
      changed: true,
      failClosed: false,
      reason: `Compliance status changed from ${from} to approved.`,
    };
  }

  if (to === 'blocked' || to === 'revoked') {
    return {
      from,
      to,
      kind: 'restriction',
      code: 'BECAME_RESTRICTED',
      changed: true,
      failClosed: true,
      reason: `Compliance status changed from ${from} to ${to}.`,
    };
  }

  return {
    from,
    to,
    kind: 'progression',
    code: 'REVIEW_PENDING',
    changed: true,
    failClosed: true,
    reason: `Compliance status changed from ${from} to pending review.`,
  };
}
