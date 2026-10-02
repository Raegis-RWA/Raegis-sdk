import {
  ComplianceBatchDiagnostic,
  ComplianceBatchRecoveryAction,
  ComplianceBatchResult,
} from '../types/compliance-batch';
import { NetworkFailureCode } from '../errors/network';

/**
 * Builds an address-free diagnostic suitable for telemetry or support reports.
 *
 * Per-item addresses, original inputs, raw errors, RPC URLs, headers, and
 * credentials are deliberately excluded.
 */
export function buildComplianceBatchDiagnostic(
  result: ComplianceBatchResult,
): ComplianceBatchDiagnostic {
  const failureCodes: Partial<Record<NetworkFailureCode, number>> = {};
  let retryAfterSeconds: number | undefined;

  for (const item of result.items) {
    if (item.status !== 'failed') {
      continue;
    }

    const code = item.diagnostic.code;
    failureCodes[code] = (failureCodes[code] ?? 0) + 1;
    if (item.diagnostic.retryAfterSeconds !== undefined) {
      retryAfterSeconds = Math.max(
        retryAfterSeconds ?? 0,
        item.diagnostic.retryAfterSeconds,
      );
    }
  }

  const diagnostic = {
    requested: result.summary.requested,
    queried: result.summary.queried,
    failed: result.summary.failed,
    invalid: result.summary.invalid,
    partial: result.summary.partial,
    exhausted: result.summary.exhausted,
    rateLimited: result.summary.rateLimited,
    failureCodes: Object.freeze(failureCodes),
    action: chooseRecoveryAction(result),
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  };

  return Object.freeze(diagnostic);
}

function chooseRecoveryAction(
  result: ComplianceBatchResult,
): ComplianceBatchRecoveryAction {
  if (result.summary.rateLimited) {
    return 'retry-with-backoff';
  }

  if (result.summary.failed > 0) {
    return result.items.some(
      (item) => item.status === 'failed' && item.diagnostic.retryable,
    )
      ? 'retry-failed-items'
      : 'report-unknown';
  }

  if (result.summary.invalid > 0) {
    return 'review-invalid-input';
  }

  return 'none';
}
