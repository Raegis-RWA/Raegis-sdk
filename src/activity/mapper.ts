import type { AdminActionStatus } from '../types/admin-receipt';
import type { AegisContractEvent } from '../types/contract-event';
import type {
  AegisActivity,
  AegisActivityBase,
  AegisActivityInput,
  AegisActivityKind,
  AegisActivitySource,
  AegisActivityStatus,
  AdminActionReceiptUnion,
  MapAegisHistoryOptions,
} from '../types/activity';

/**
 * Maps one already-decoded Aegis event or admin receipt into the stable activity model.
 *
 * `position` is used only as a deterministic tie-breaker in the activity id. Callers
 * mapping a batch should normally use `mapAegisHistory`, which supplies it for them.
 */
export function mapAegisActivity(
  input: AegisActivityInput,
  position = 0,
): AegisActivity {
  const normalizedPosition = normalizePosition(position);

  if ('operation' in input) {
    return mapAdminReceipt(input, normalizedPosition);
  }

  return mapContractEvent(input, normalizedPosition);
}

/**
 * Maps a mixed event/receipt history while preserving the caller's input order.
 *
 * The mapper intentionally does not fetch RPC data, infer wall-clock ledger times, or
 * deduplicate receipt/event observations that happen to share a transaction hash.
 */
export function mapAegisHistory(
  inputs: readonly AegisActivityInput[],
  options: MapAegisHistoryOptions = {},
): AegisActivity[] {
  const includeUnknownEvents = options.includeUnknownEvents !== false;

  return inputs.flatMap((input, position) => {
    if (!includeUnknownEvents && !('operation' in input) && input.kind === 'unknown') {
      return [];
    }
    return [mapAegisActivity(input, position)];
  });
}

function mapContractEvent(
  event: AegisContractEvent,
  position: number,
): AegisActivity {
  const status: AegisActivityStatus = event.inSuccessfulContractCall
    ? 'confirmed'
    : 'failed';

  switch (event.kind) {
    case 'compliance':
      return {
        ...buildBase(
          'contract-event',
          'compliance',
          status,
          event.txHash ?? null,
          event.decodedAt,
          event.ledger,
          event.contractId,
          position,
          event.action === 'whitelist_add'
            ? 'Whitelist addition observed.'
            : 'Whitelist removal observed.',
        ),
        action: event.action,
        address: event.address,
        ...(event.admin ? { actor: event.admin } : {}),
      };

    case 'mint':
      return {
        ...buildBase(
          'contract-event',
          'mint',
          status,
          event.txHash ?? null,
          event.decodedAt,
          event.ledger,
          event.contractId,
          position,
          'Asset mint observed.',
        ),
        recipient: event.to,
        amount: event.amount,
        ...(event.assetId ? { assetId: event.assetId } : {}),
        ...(event.operator ? { actor: event.operator } : {}),
      };

    case 'transfer':
      return {
        ...buildBase(
          'contract-event',
          'transfer',
          status,
          event.txHash ?? null,
          event.decodedAt,
          event.ledger,
          event.contractId,
          position,
          'Asset transfer observed.',
        ),
        from: event.from,
        to: event.to,
        amount: event.amount,
      };

    case 'admin': {
      const targetId =
        event.action === 'asset_register' ? event.assetId : event.contractId;
      return {
        ...buildBase(
          'contract-event',
          'admin',
          status,
          event.txHash ?? null,
          event.decodedAt,
          event.ledger,
          event.contractId,
          position,
          adminActionLabel(event.action),
        ),
        action: event.action,
        ...(targetId ? { targetId } : {}),
        ...(event.admin ? { actor: event.admin } : {}),
      };
    }

    case 'asset_metadata':
      return {
        ...buildBase(
          'contract-event',
          'asset-metadata',
          status,
          event.txHash ?? null,
          event.decodedAt,
          event.ledger,
          event.contractId,
          position,
          'Asset metadata update observed.',
        ),
        assetId: event.assetId,
        symbol: event.symbol,
        name: event.name,
        decimals: event.decimals,
        ...(event.category ? { category: event.category } : {}),
        ...(event.isRwa !== undefined ? { isRwa: event.isRwa } : {}),
      };

    case 'unknown':
      return {
        ...buildBase(
          'contract-event',
          'unknown',
          status,
          event.txHash ?? null,
          event.decodedAt,
          event.ledger,
          event.contractId,
          position,
          'Unrecognized Aegis contract event observed.',
        ),
        ...(event.reason ? { reason: event.reason } : {}),
      };
  }
}

function mapAdminReceipt(
  receipt: AdminActionReceiptUnion,
  position: number,
): AegisActivity {
  const status = mapAdminStatus(receipt.status);

  switch (receipt.operation) {
    case 'whitelist-add':
    case 'whitelist-remove': {
      const action =
        receipt.operation === 'whitelist-add'
          ? 'whitelist_add' as const
          : 'whitelist_remove' as const;
      return {
        ...buildBase(
          'admin-receipt',
          'compliance',
          status,
          receipt.transactionHash,
          receipt.observedAt,
          undefined,
          undefined,
          position,
          receiptSummary(receipt.operation, status),
        ),
        action,
        address: receipt.target.address,
      };
    }

    case 'asset-mint': {
      return {
        ...buildBase(
          'admin-receipt',
          'mint',
          status,
          receipt.transactionHash,
          receipt.observedAt,
          undefined,
          undefined,
          position,
          receiptSummary(receipt.operation, status),
        ),
        recipient: receipt.target.recipient,
        amount: receipt.target.amount,
        assetId: receipt.target.assetId,
      };
    }

    case 'asset-register': {
      return {
        ...buildBase(
          'admin-receipt',
          'admin',
          status,
          receipt.transactionHash,
          receipt.observedAt,
          undefined,
          undefined,
          position,
          receiptSummary(receipt.operation, status),
        ),
        action: 'asset_register',
        targetId: receipt.target.assetId,
      };
    }

    case 'protocol-pause':
    case 'protocol-unpause': {
      return {
        ...buildBase(
          'admin-receipt',
          'admin',
          status,
          receipt.transactionHash,
          receipt.observedAt,
          undefined,
          receipt.target.contractId,
          position,
          receiptSummary(receipt.operation, status),
        ),
        action:
          receipt.operation === 'protocol-pause'
            ? 'protocol_pause'
            : 'protocol_unpause',
        targetId: receipt.target.contractId,
      };
    }
  }
}

function buildBase<K extends AegisActivityKind>(
  source: AegisActivitySource,
  kind: K,
  status: AegisActivityStatus,
  transactionHash: string | null,
  observedAt: string,
  ledger: number | undefined,
  contractId: string | undefined,
  position: number,
  summary: string,
): AegisActivityBase & { kind: K } {
  return {
    id: buildActivityId(source, kind, transactionHash, ledger, position),
    source,
    kind,
    status,
    transactionHash,
    observedAt,
    summary,
    ...(ledger !== undefined ? { ledger } : {}),
    ...(contractId ? { contractId } : {}),
  };
}

function buildActivityId(
  source: AegisActivitySource,
  kind: AegisActivityKind,
  transactionHash: string | null,
  ledger: number | undefined,
  position: number,
): string {
  const anchor = transactionHash?.trim().toLowerCase()
    || (ledger !== undefined ? `ledger-${ledger}` : 'unanchored');
  return `${source}:${anchor}:${kind}:${position}`;
}

function normalizePosition(position: number): number {
  if (!Number.isInteger(position) || position < 0) {
    throw new RangeError('Activity position must be a non-negative integer.');
  }
  return position;
}

function mapAdminStatus(status: AdminActionStatus): AegisActivityStatus {
  switch (status) {
    case 'success':
      return 'confirmed';
    case 'pending':
      return 'pending';
    case 'failed':
      return 'failed';
    case 'unknown':
      return 'unknown';
  }
}

function adminActionLabel(
  action: 'protocol_pause' | 'protocol_unpause' | 'asset_register',
): string {
  switch (action) {
    case 'protocol_pause':
      return 'Protocol pause observed.';
    case 'protocol_unpause':
      return 'Protocol unpause observed.';
    case 'asset_register':
      return 'Asset registration observed.';
  }
}

function receiptSummary(
  operation: AdminActionReceiptUnion['operation'],
  status: AegisActivityStatus,
): string {
  const operationLabel: Record<AdminActionReceiptUnion['operation'], string> = {
    'whitelist-add': 'Whitelist addition',
    'whitelist-remove': 'Whitelist removal',
    'asset-register': 'Asset registration',
    'protocol-pause': 'Protocol pause',
    'protocol-unpause': 'Protocol unpause',
    'asset-mint': 'Asset mint',
  };

  const statusLabel: Record<AegisActivityStatus, string> = {
    confirmed: 'confirmed',
    pending: 'pending',
    failed: 'failed',
    unknown: 'has an unknown outcome',
  };

  return `${operationLabel[operation]} ${statusLabel[status]}.`;
}
