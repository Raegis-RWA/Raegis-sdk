import {
  TransactionReceipt,
  TransactionReceiptError,
  TransactionReceiptInput,
  TransactionReceiptStatus,
  TransactionReceiptStatusInput,
} from '../types/transaction-receipt';
import {
  buildTransactionExplorerUrlCore,
  isPositiveReceiptAmount,
  normalizeReceiptFailureCodeCore,
  normalizeReceiptObservedAtCore,
  normalizeTransactionHashCore,
  normalizeTransactionReceiptStatusCore,
} from './receipt-core';

const OPERATION_LABELS: Readonly<Record<TransactionReceiptInput['operation'], string>> = {
  'compliance-update': 'Compliance update',
  'asset-mint': 'Asset mint',
  'asset-transfer': 'Asset transfer',
  'investor-update': 'Investor update',
};

const STATUS_LABELS: Readonly<Record<TransactionReceiptStatus, string>> = {
  success: 'confirmed',
  pending: 'is pending confirmation',
  failed: 'failed',
  unknown: 'has an unknown outcome',
};

const transactionReceiptError = (
  code: ConstructorParameters<typeof TransactionReceiptError>[0],
  message: string,
): TransactionReceiptError => new TransactionReceiptError(code, message);

export function normalizeTransactionReceiptStatus(
  status: TransactionReceiptStatusInput | string,
): TransactionReceiptStatus {
  return normalizeTransactionReceiptStatusCore(status);
}

export function buildTransactionExplorerUrl(
  transactionHash: string | null | undefined,
  networkPassphrase: string,
  explorerBaseUrl?: string,
): string | null {
  return buildTransactionExplorerUrlCore(
    transactionHash,
    networkPassphrase,
    explorerBaseUrl,
    transactionReceiptError,
  );
}

export function buildTransactionReceipt<TInput extends TransactionReceiptInput>(
  input: TInput,
): TransactionReceipt<TInput> {
  // Validate one immutable set of own target fields rather than re-reading a
  // caller-owned object after validation (getters can change amounts).
  const { operation, target } = snapshotReceiptTarget(input);
  validateReceiptTarget({ operation, target } as TransactionReceiptInput);

  const status = normalizeTransactionReceiptStatus(input.status);
  const transactionHash =
    input.transactionHash == null
      ? null
      : normalizeTransactionHashCore(input.transactionHash, transactionReceiptError);

  if (status === 'success' && !transactionHash) {
    throw new TransactionReceiptError(
      'MISSING_TRANSACTION_HASH',
      'A successful transaction receipt requires a transaction hash.',
    );
  }

  const observedAt = normalizeReceiptObservedAtCore(
    input.observedAt,
    transactionReceiptError,
  );
  const failureCode = normalizeReceiptFailureCodeCore(
    input.failureCode,
    transactionReceiptError,
  );

  const receipt: TransactionReceipt<TInput> = {
    operation,
    target: Object.freeze(target) as TInput['target'],
    status,
    transactionHash,
    explorerUrl: buildTransactionExplorerUrl(
      transactionHash,
      input.networkPassphrase,
      input.explorerBaseUrl,
    ),
    observedAt,
    summary: `${OPERATION_LABELS[operation]} ${STATUS_LABELS[status]}.`,
    ...(failureCode ? { failureCode } : {}),
  };

  return Object.freeze(receipt);
}

const TARGET_FIELDS: Readonly<Record<TransactionReceiptInput['operation'], readonly string[]>> = {
  'compliance-update': ['address', 'compliant'],
  'asset-mint': ['assetId', 'recipient', 'amount'],
  'asset-transfer': ['assetId', 'from', 'to', 'amount'],
  'investor-update': ['investor'],
};

/**
 * Reject accessor/inherited/unreadable target fields before validation.
 * The returned snapshot is used for BOTH validation and display, preventing
 * a malicious or mutable RPC object from changing receipt data mid-build.
 */
function snapshotReceiptTarget(input: TransactionReceiptInput): {
  operation: TransactionReceiptInput['operation'];
  target: TransactionReceiptInput['target'];
} {
  if (!input || typeof input !== 'object') {
    throw new TransactionReceiptError('INVALID_TARGET', 'Transaction receipt input must be an object.');
  }
  try {
    const operation = Object.getOwnPropertyDescriptor(input, 'operation');
    const targetDescriptor = Object.getOwnPropertyDescriptor(input, 'target');
    if (!operation || !('value' in operation) ||
        !targetDescriptor || !('value' in targetDescriptor)) {
      throw new TransactionReceiptError('INVALID_TARGET', 'Receipt operation and target must be own data properties.');
    }
    const target = targetDescriptor.value;
    const fields = TARGET_FIELDS[operation.value as TransactionReceiptInput['operation']];
    if (!fields || !target || typeof target !== 'object' || Array.isArray(target)) {
      throw new TransactionReceiptError('INVALID_TARGET', 'Transaction receipt target must be an object.');
    }

    const values: Record<string, unknown> = {};
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(target, field);
      if (!descriptor || !('value' in descriptor)) {
        throw new TransactionReceiptError('INVALID_TARGET', 'Receipt fields must be own data properties.');
      }
      values[field] = descriptor.value;
    }
    return {
      operation: operation.value as TransactionReceiptInput['operation'],
      target: values as unknown as TransactionReceiptInput['target'],
    };
  } catch (error) {
    if (error instanceof TransactionReceiptError) throw error;
    throw new TransactionReceiptError('INVALID_TARGET', 'Transaction receipt target cannot be safely inspected.');
  }
}

function requireValue(value: string, field: string): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TransactionReceiptError('INVALID_TARGET', `${field} must be a non-empty string.`);
  }
}

function validateReceiptTarget(input: TransactionReceiptInput): void {
  // Inputs can cross RPC, storage, or JSON boundaries without their static
  // TypeScript shape. Reject malformed records before reading nested fields,
  // rather than leaking a TypeError to a dashboard confirmation screen.
  if (
    input === null ||
    typeof input !== 'object' ||
    !input.target ||
    typeof input.target !== 'object' ||
    Array.isArray(input.target)
  ) {
    throw new TransactionReceiptError('INVALID_TARGET', 'Transaction receipt target must be an object.');
  }
  switch (input.operation) {
    case 'compliance-update':
      requireValue(input.target.address, 'Compliance address');
      if (typeof input.target.compliant !== 'boolean') {
        throw new TransactionReceiptError('INVALID_TARGET', 'Compliance state must be a boolean.');
      }
      return;
    case 'asset-mint':
      requireValue(input.target.assetId, 'Asset identifier');
      requireValue(input.target.recipient, 'Mint recipient');
      if (!isPositiveReceiptAmount(input.target.amount)) {
        throw new TransactionReceiptError(
          'INVALID_AMOUNT',
          'Mint amount must be a positive decimal string.',
        );
      }
      return;
    case 'asset-transfer':
      requireValue(input.target.assetId, 'Asset identifier');
      requireValue(input.target.from, 'Transfer source');
      requireValue(input.target.to, 'Transfer destination');
      if (!isPositiveReceiptAmount(input.target.amount)) {
        throw new TransactionReceiptError(
          'INVALID_AMOUNT',
          'Transfer amount must be a positive decimal string.',
        );
      }
      return;
    case 'investor-update':
      requireValue(input.target.investor, 'Investor identifier');
      return;
    default:
      throw new TransactionReceiptError(
        'INVALID_TARGET',
        'Unsupported transaction receipt operation.',
      );
  }
}
