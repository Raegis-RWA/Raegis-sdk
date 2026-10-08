import {
  AdminActionReceipt,
  AdminActionReceiptInput,
  AdminActionStatus,
  AdminReceiptError,
  AdminTransactionStatusInput,
} from '../types/admin-receipt';
import {
  buildTransactionExplorerUrlCore,
  isPositiveReceiptAmount,
  normalizeReceiptFailureCodeCore,
  normalizeReceiptObservedAtCore,
  normalizeTransactionHashCore,
  normalizeTransactionReceiptStatusCore,
} from '../transactions/receipt-core';

const OPERATION_LABELS: Readonly<Record<AdminActionReceiptInput['operation'], string>> = {
  'whitelist-add': 'Whitelist addition',
  'whitelist-remove': 'Whitelist removal',
  'asset-register': 'Asset registration',
  'protocol-pause': 'Protocol pause',
  'protocol-unpause': 'Protocol unpause',
  'asset-mint': 'Asset mint',
};

const STATUS_LABELS: Readonly<Record<AdminActionStatus, string>> = {
  success: 'confirmed',
  pending: 'is pending confirmation',
  failed: 'failed',
  unknown: 'has an unknown outcome',
};

const adminReceiptError = (
  code: ConstructorParameters<typeof AdminReceiptError>[0],
  message: string,
): AdminReceiptError => new AdminReceiptError(code, message);

export function normalizeAdminActionStatus(
  status: AdminTransactionStatusInput | string,
): AdminActionStatus {
  return normalizeTransactionReceiptStatusCore(status);
}

export function buildAdminTransactionExplorerUrl(
  transactionHash: string | null | undefined,
  networkPassphrase: string,
  explorerBaseUrl?: string,
): string | null {
  return buildTransactionExplorerUrlCore(
    transactionHash,
    networkPassphrase,
    explorerBaseUrl,
    adminReceiptError,
  );
}

export function buildAdminActionReceipt<TInput extends AdminActionReceiptInput>(
  input: TInput,
): AdminActionReceipt<TInput> {
  const safeTarget = snapshotTarget(input);
  validateTarget(safeTarget as AdminActionReceiptInput);

  const status = normalizeAdminActionStatus(input.status);
  const transactionHash =
    input.transactionHash == null
      ? null
      : normalizeTransactionHashCore(input.transactionHash, adminReceiptError);

  if (status === 'success' && !transactionHash) {
    throw new AdminReceiptError(
      'MISSING_TRANSACTION_HASH',
      'A successful admin action receipt requires a transaction hash.',
    );
  }

  const observedAt = normalizeReceiptObservedAtCore(input.observedAt, adminReceiptError);
  const failureCode = normalizeReceiptFailureCodeCore(input.failureCode, adminReceiptError);

  const receipt: AdminActionReceipt<TInput> = {
    operation: safeTarget.operation as TInput['operation'],
    target: safeTarget.target as TInput['target'],
    status,
    transactionHash,
    explorerUrl: buildAdminTransactionExplorerUrl(
      transactionHash,
      input.networkPassphrase,
      input.explorerBaseUrl,
    ),
    observedAt,
    summary: `${OPERATION_LABELS[safeTarget.operation]} ${STATUS_LABELS[status]}.`,
    ...(failureCode ? { failureCode } : {}),
  };

  return Object.freeze(receipt);
}

function validateTarget(input: AdminActionReceiptInput): void {
  const requireValue = (value: string, field: string): void => {
    if (!value || !value.trim()) {
      throw new AdminReceiptError('INVALID_TARGET', `${field} is required.`);
    }
  };

  switch (input.operation) {
    case 'whitelist-add':
    case 'whitelist-remove':
      requireValue(input.target.address, 'Whitelist address');
      return;
    case 'asset-register':
      requireValue(input.target.assetId, 'Asset identifier');
      return;
    case 'protocol-pause':
    case 'protocol-unpause':
      requireValue(input.target.contractId, 'Contract identifier');
      return;
    case 'asset-mint':
      requireValue(input.target.assetId, 'Asset identifier');
      requireValue(input.target.recipient, 'Mint recipient');
      if (!isPositiveReceiptAmount(input.target.amount)) {
        throw new AdminReceiptError(
          'INVALID_AMOUNT',
          'Mint amount must be a positive decimal string.',
        );
      }
  }
}

const ADMIN_TARGET_FIELDS: Readonly<
  Record<AdminActionReceiptInput['operation'], readonly string[]>
> = {
  'whitelist-add': ['address'],
  'whitelist-remove': ['address'],
  'asset-register': ['assetId'],
  'protocol-pause': ['contractId'],
  'protocol-unpause': ['contractId'],
  'asset-mint': ['assetId', 'recipient', 'amount'],
};

function snapshotTarget(
  input: AdminActionReceiptInput,
): Pick<AdminActionReceiptInput, 'operation' | 'target'> {
  try {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new AdminReceiptError(
        'INVALID_TARGET',
        'Admin receipt input must be an object with an own target.',
      );
    }

    const operationDescriptor = Object.getOwnPropertyDescriptor(input, 'operation');
    const targetDescriptor = Object.getOwnPropertyDescriptor(input, 'target');
    if (
      !operationDescriptor ||
      !('value' in operationDescriptor) ||
      !targetDescriptor ||
      !('value' in targetDescriptor)
    ) {
      throw new AdminReceiptError(
        'INVALID_TARGET',
        'Admin receipt operation and target must be own data properties.',
      );
    }

    const operation = operationDescriptor.value as AdminActionReceiptInput['operation'];
    const fields = ADMIN_TARGET_FIELDS[operation];
    const target = targetDescriptor.value;
    if (!fields || target === null || typeof target !== 'object' || Array.isArray(target)) {
      throw new AdminReceiptError(
        'INVALID_TARGET',
        'Admin receipt target must match a supported operation.',
      );
    }

    const values: Record<string, unknown> = {};
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(target, field);
      if (!descriptor || !('value' in descriptor)) {
        throw new AdminReceiptError(
          'INVALID_TARGET',
          `Admin receipt target field ${field} must be an own data property.`,
        );
      }
      values[field] = descriptor.value;
    }

    return {
      operation,
      target: Object.freeze(values) as AdminActionReceiptInput['target'],
    };
  } catch (error) {
    if (error instanceof AdminReceiptError) throw error;
    throw new AdminReceiptError(
      'INVALID_TARGET',
      'Admin receipt target cannot be safely inspected.',
    );
  }
}
