import { rpc } from '@stellar/stellar-sdk';
import { TransactionReconciliationError } from '../errors/transaction';
import { decodeTransactionResultCode } from '../soroban/transaction-result';
import {
  ReconcileTransactionResponseOptions,
  ReconcileTransactionStatusInput,
  TransactionReconciliationCode,
  TransactionResult,
  TransactionResultStatus,
} from '../types/transaction-result';

const TRANSACTION_HASH_PATTERN = /^[a-fA-F0-9]{64}$/;
const FAILURE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_.:-]{0,63}$/;

interface StatusMapping {
  status: TransactionResultStatus;
  code: TransactionReconciliationCode;
}

/**
 * Conservative mapping from Soroban RPC status strings to SDK statuses.
 *
 * `NOT_FOUND` stays `pending` because the transaction may simply not have been
 * included yet, or may sit outside the RPC retention window — neither case
 * proves rejection or failure.
 */
const STATUS_MAP: Readonly<Record<string, StatusMapping>> = {
  SUCCESS: { status: 'confirmed', code: 'CONFIRMED' },
  CONFIRMED: { status: 'confirmed', code: 'CONFIRMED' },
  FAILED: { status: 'failed', code: 'LEDGER_FAILURE' },
  NOT_FOUND: { status: 'pending', code: 'AWAITING_INCLUSION' },
  PENDING: { status: 'pending', code: 'AWAITING_INCLUSION' },
  DUPLICATE: { status: 'pending', code: 'SUBMISSION_DUPLICATE' },
  ERROR: { status: 'rejected', code: 'SUBMISSION_REJECTED' },
  TRY_AGAIN_LATER: { status: 'unknown', code: 'SUBMISSION_THROTTLED' },
};

const SUMMARIES: Readonly<Record<TransactionReconciliationCode, string>> = {
  CONFIRMED: 'Transaction was included in a ledger and succeeded.',
  LEDGER_FAILURE: 'Transaction was included in a ledger and failed.',
  AWAITING_INCLUSION:
    'Transaction has not been observed in a ledger yet. Keep reconciling the same hash.',
  SUBMISSION_DUPLICATE:
    'Transaction was already submitted. Reconcile the existing hash instead of resubmitting.',
  SUBMISSION_REJECTED:
    'Transaction was rejected before entering a ledger. Correct and re-sign before submitting again.',
  SUBMISSION_THROTTLED:
    'Submission was throttled, so the outcome is indeterminate. Reconcile the hash before retrying.',
  OBSERVATION_WINDOW_EXPIRED:
    'Observation window ended without inclusion. The outcome is still indeterminate.',
  UNRECOGNIZED_STATUS:
    'Reported status is not recognised by this SDK version and is treated as indeterminate.',
};

const TERMINAL_STATUSES: ReadonlySet<TransactionResultStatus> = new Set([
  'confirmed',
  'failed',
  'rejected',
]);

/**
 * Normalises a raw RPC status string into a stable SDK transaction status.
 *
 * Unrecognised values resolve to `unknown` rather than implying success.
 */
export function normalizeTransactionResultStatus(
  status: string,
): TransactionResultStatus {
  return resolveMapping(status).status;
}

/**
 * Reconciles a transaction hash and RPC status into a typed result.
 *
 * Status mapping never throws: unrecognised statuses resolve to `unknown`.
 * Malformed hashes, timestamps, and failure codes throw
 * `TransactionReconciliationError`.
 */
export function reconcileTransactionStatus(
  input: ReconcileTransactionStatusInput,
): TransactionResult {
  const hash = normalizeTransactionHash(input.hash);
  const rpcStatus = normalizeStatusString(input.status);
  const mapping = applyObservationWindow(
    resolveMapping(rpcStatus),
    input.observationWindowExpired === true,
  );

  const status = mapping.status;
  const code = mapping.code;
  const failureCode = normalizeFailureCode(input.failureCode);

  const result = {
    hash,
    status,
    code,
    rpcStatus,
    terminal: TERMINAL_STATUSES.has(status),
    safeToResubmit: status === 'rejected',
    summary: SUMMARIES[code],
    observedAt: normalizeObservedAt(input.observedAt),
    attempts: normalizeAttempts(input.attempts),
    ...(input.ledger !== undefined ? { ledger: input.ledger } : {}),
    ...(input.latestLedger !== undefined
      ? { latestLedger: input.latestLedger }
      : {}),
    ...(failureCode ? { failureCode } : {}),
  } as TransactionResult;

  return Object.freeze(result);
}

/**
 * Reconciles a `sendTransaction` response without polling.
 *
 * A submission response only reports whether the network accepted the
 * transaction for inclusion, so `PENDING` and `DUPLICATE` remain `pending`.
 */
export function reconcileSendTransactionResponse(
  response: rpc.Api.SendTransactionResponse,
  options: ReconcileTransactionResponseOptions = {},
): TransactionResult {
  return reconcileTransactionStatus({
    hash: response.hash,
    status: response.status,
    latestLedger: response.latestLedger,
    attempts: options.attempts,
    observedAt: options.observedAt,
    observationWindowExpired: options.observationWindowExpired,
    failureCode: decodeTransactionResultCode(response.errorResult),
  });
}

/**
 * Reconciles a `getTransaction` response for a known transaction hash.
 */
export function reconcileGetTransactionResponse(
  hash: string,
  response: rpc.Api.GetTransactionResponse,
  options: ReconcileTransactionResponseOptions = {},
): TransactionResult {
  const ledger = 'ledger' in response ? response.ledger : undefined;
  const failureCode =
    response.status === rpc.Api.GetTransactionStatus.FAILED
      ? decodeTransactionResultCode(response.resultXdr)
      : undefined;

  return reconcileTransactionStatus({
    hash,
    status: response.status,
    ledger,
    latestLedger: response.latestLedger,
    attempts: options.attempts,
    observedAt: options.observedAt,
    observationWindowExpired: options.observationWindowExpired,
    failureCode,
  });
}

/**
 * Validates and normalises a Soroban transaction hash.
 */
export function normalizeTransactionHash(hash: string): string {
  if (typeof hash !== 'string') {
    throw new TransactionReconciliationError(
      'INVALID_TRANSACTION_HASH',
      'Transaction hash must be a string.',
    );
  }

  const normalized = hash.trim().toLowerCase();
  if (!TRANSACTION_HASH_PATTERN.test(normalized)) {
    throw new TransactionReconciliationError(
      'INVALID_TRANSACTION_HASH',
      'Transaction hash must contain exactly 64 hexadecimal characters.',
    );
  }

  return normalized;
}

function resolveMapping(status: string): StatusMapping {
  const normalized = normalizeStatusString(status);
  return (
    STATUS_MAP[normalized] ?? {
      status: 'unknown',
      code: 'UNRECOGNIZED_STATUS',
    }
  );
}

function applyObservationWindow(
  mapping: StatusMapping,
  windowExpired: boolean,
): StatusMapping {
  if (!windowExpired || mapping.status !== 'pending') {
    return mapping;
  }

  return { status: 'unknown', code: 'OBSERVATION_WINDOW_EXPIRED' };
}

function normalizeStatusString(status: unknown): string {
  if (typeof status !== 'string' || !status.trim()) {
    throw new TransactionReconciliationError(
      'INVALID_STATUS',
      'Transaction status must be a non-empty string.',
    );
  }

  return status.trim().toUpperCase();
}

function normalizeAttempts(attempts?: number): number {
  if (attempts === undefined) {
    return 1;
  }

  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new TransactionReconciliationError(
      'INVALID_POLL_OPTIONS',
      'Observation attempts must be a positive integer.',
    );
  }

  return attempts;
}

function normalizeObservedAt(observedAt?: Date | string): string {
  const date =
    observedAt instanceof Date
      ? observedAt
      : new Date(observedAt ?? Date.now());

  if (Number.isNaN(date.getTime())) {
    throw new TransactionReconciliationError(
      'INVALID_TIMESTAMP',
      'Observation timestamp must be a valid date.',
    );
  }

  return date.toISOString();
}

function normalizeFailureCode(failureCode?: string): string | undefined {
  if (!failureCode) {
    return undefined;
  }

  const normalized = failureCode.trim().toUpperCase();
  return FAILURE_CODE_PATTERN.test(normalized) ? normalized : undefined;
}
