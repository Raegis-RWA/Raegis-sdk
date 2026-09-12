/**
 * Stable reconciliation status for a submitted Soroban transaction.
 *
 * `confirmed`, `failed`, and `rejected` are terminal. `pending` and `unknown`
 * mean the outcome has not been observed yet — they are never proof of failure.
 */
export type TransactionResultStatus =
  | 'confirmed'
  | 'failed'
  | 'pending'
  | 'rejected'
  | 'unknown';

/**
 * Machine-readable reason behind a reconciled status.
 */
export type TransactionReconciliationCode =
  | 'CONFIRMED'
  | 'LEDGER_FAILURE'
  | 'AWAITING_INCLUSION'
  | 'SUBMISSION_DUPLICATE'
  | 'SUBMISSION_REJECTED'
  | 'SUBMISSION_THROTTLED'
  | 'OBSERVATION_WINDOW_EXPIRED'
  | 'UNRECOGNIZED_STATUS';

/**
 * Soroban RPC status strings the reconciler recognises.
 *
 * `SUCCESS`, `FAILED`, and `NOT_FOUND` come from `getTransaction`.
 * `PENDING`, `DUPLICATE`, `TRY_AGAIN_LATER`, and `ERROR` come from `sendTransaction`.
 */
export type TransactionStatusInput =
  | 'SUCCESS'
  | 'FAILED'
  | 'NOT_FOUND'
  | 'PENDING'
  | 'DUPLICATE'
  | 'TRY_AGAIN_LATER'
  | 'ERROR';

export interface TransactionResultBase {
  hash: string;
  status: TransactionResultStatus;
  code: TransactionReconciliationCode;
  /** Raw RPC status string that produced this reconciliation. */
  rpcStatus: string;
  /** `true` only when further observation cannot change the outcome. */
  terminal: boolean;
  /**
   * `true` only when the network never accepted the submission, so no ledger
   * slot or sequence number was consumed. Even then, build a corrected
   * transaction instead of resending the same envelope.
   */
  safeToResubmit: boolean;
  summary: string;
  observedAt: string;
  /** Number of observations made, including the one that produced this result. */
  attempts: number;
  ledger?: number;
  latestLedger?: number;
  failureCode?: string;
}

export interface ConfirmedTransactionResult extends TransactionResultBase {
  status: 'confirmed';
  code: 'CONFIRMED';
  terminal: true;
  safeToResubmit: false;
}

export interface FailedTransactionResult extends TransactionResultBase {
  status: 'failed';
  code: 'LEDGER_FAILURE';
  terminal: true;
  safeToResubmit: false;
}

export interface PendingTransactionResult extends TransactionResultBase {
  status: 'pending';
  code: 'AWAITING_INCLUSION' | 'SUBMISSION_DUPLICATE';
  terminal: false;
  safeToResubmit: false;
}

export interface RejectedTransactionResult extends TransactionResultBase {
  status: 'rejected';
  code: 'SUBMISSION_REJECTED';
  terminal: true;
  safeToResubmit: true;
}

export interface UnknownTransactionResult extends TransactionResultBase {
  status: 'unknown';
  code:
    | 'SUBMISSION_THROTTLED'
    | 'OBSERVATION_WINDOW_EXPIRED'
    | 'UNRECOGNIZED_STATUS';
  terminal: false;
  safeToResubmit: false;
}

/**
 * Discriminated reconciliation result for a submitted transaction.
 */
export type TransactionResult =
  | ConfirmedTransactionResult
  | FailedTransactionResult
  | PendingTransactionResult
  | RejectedTransactionResult
  | UnknownTransactionResult;

export interface ReconcileTransactionStatusInput {
  hash: string;
  status: TransactionStatusInput | string;
  ledger?: number;
  latestLedger?: number;
  attempts?: number;
  failureCode?: string;
  observedAt?: Date | string;
  /**
   * Set when a bounded observation window ended without inclusion. Converts a
   * `pending` reading into `unknown` so callers stop waiting without assuming
   * the transaction failed.
   */
  observationWindowExpired?: boolean;
}

export interface ReconcileTransactionResponseOptions {
  attempts?: number;
  observedAt?: Date | string;
  observationWindowExpired?: boolean;
}

/**
 * Bounded polling configuration. Polling only reads status; it never resubmits.
 */
export interface WaitForTransactionOptions {
  /** Maximum number of `getTransaction` reads. Defaults to `10`. */
  maxAttempts?: number;
  /** Delay before the second read, in milliseconds. Defaults to `1000`. */
  intervalMs?: number;
  /** Multiplier applied to the delay after each read. Defaults to `1.5`. */
  backoffFactor?: number;
  /** Upper bound for the delay between reads. Defaults to `8000`. */
  maxIntervalMs?: number;
  /** Injectable delay, primarily for deterministic tests. */
  sleep?: (milliseconds: number) => Promise<void>;
}
