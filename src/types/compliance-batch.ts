import { NetworkFailureDiagnostic } from '../diagnostics/network';
import { NetworkFailureCode } from '../errors/network';

export type ComplianceBatchItemStatus =
  | 'whitelisted'
  | 'not-whitelisted'
  | 'invalid-address'
  | 'failed';

export type ComplianceBatchItemCode =
  | 'OK'
  | 'INVALID_ADDRESS'
  | 'MUXED_ADDRESS_UNSUPPORTED'
  | 'CONTRACT_ADDRESS_UNSUPPORTED'
  | 'COMPLIANCE_QUERY_FAILED';

interface ComplianceBatchItemBase {
  /** Original zero-based position, used to correlate with the caller's input. */
  readonly index: number;
  readonly status: ComplianceBatchItemStatus;
  readonly code: ComplianceBatchItemCode;
  readonly isWhitelisted: boolean;
  /** True when this item reused another identical address's RPC result. */
  readonly duplicate: boolean;
  /** Fixed, safe UI copy. Never contains raw input or provider error text. */
  readonly message: string;
}

export interface ComplianceBatchResolvedItem
  extends ComplianceBatchItemBase {
  readonly status: 'whitelisted' | 'not-whitelisted';
  readonly code: 'OK';
  /** Present only after an address passes Stellar account validation. */
  readonly address: string;
}

export interface ComplianceBatchInvalidItem extends ComplianceBatchItemBase {
  readonly status: 'invalid-address';
  readonly code:
    | 'INVALID_ADDRESS'
    | 'MUXED_ADDRESS_UNSUPPORTED'
    | 'CONTRACT_ADDRESS_UNSUPPORTED';
  readonly isWhitelisted: false;
  /**
   * Invalid input is deliberately omitted. Use `index` to correlate with the
   * caller's array without copying arbitrary input into logs or diagnostics.
   */
  readonly address?: never;
}

export interface ComplianceBatchFailedItem extends ComplianceBatchItemBase {
  readonly status: 'failed';
  readonly code: 'COMPLIANCE_QUERY_FAILED';
  readonly isWhitelisted: false;
  /** Present only after an address passes Stellar account validation. */
  readonly address: string;
  readonly diagnostic: NetworkFailureDiagnostic;
}

export type ComplianceBatchItem =
  | ComplianceBatchResolvedItem
  | ComplianceBatchInvalidItem
  | ComplianceBatchFailedItem;

export interface ComplianceBatchSummary {
  readonly requested: number;
  /** Distinct valid addresses for which an RPC request was attempted. */
  readonly queried: number;
  readonly whitelisted: number;
  readonly notWhitelisted: number;
  readonly invalid: number;
  readonly failed: number;
  readonly duplicates: number;
  readonly partial: boolean;
  readonly exhausted: boolean;
  readonly rateLimited: boolean;
  readonly durationMs: number;
}

export interface ComplianceBatchResult {
  /** Exactly one item per input, in input order. */
  readonly items: readonly ComplianceBatchItem[];
  readonly summary: ComplianceBatchSummary;
  readonly fetchedAt: string;
}

export interface ComplianceBatchOptions {
  /** Maximum simultaneous RPC requests. Defaults to `4`; allowed range 1–20. */
  concurrency?: number;
  /** Query repeated valid addresses once and fan out the result. Defaults true. */
  deduplicate?: boolean;
  /** Maximum accepted input length. Defaults to `100`; allowed range 1–1000. */
  maxBatchSize?: number;
}

export type ComplianceBatchRecoveryAction =
  | 'none'
  | 'retry-failed-items'
  | 'retry-with-backoff'
  | 'review-invalid-input'
  | 'report-unknown';

/**
 * Address-free, serialisable roll-up for logs, telemetry, and support reports.
 */
export interface ComplianceBatchDiagnostic {
  readonly requested: number;
  readonly queried: number;
  readonly failed: number;
  readonly invalid: number;
  readonly partial: boolean;
  readonly exhausted: boolean;
  readonly rateLimited: boolean;
  readonly failureCodes: Readonly<Partial<Record<NetworkFailureCode, number>>>;
  readonly action: ComplianceBatchRecoveryAction;
  readonly retryAfterSeconds?: number;
}
