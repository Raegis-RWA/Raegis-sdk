import { rpc } from '@stellar/stellar-sdk';

/**
 * Deterministic transaction hashes. These are placeholder hex strings, not
 * hashes of real submitted transactions.
 */
export const TRANSACTION_HASHES = {
  confirmed: 'ab01'.padEnd(64, '0'),
  failed: 'ba02'.padEnd(64, '0'),
  pending: 'cd03'.padEnd(64, '0'),
  rejected: 'de04'.padEnd(64, '0'),
} as const;

/**
 * Minimal stand-in for `xdr.TransactionResult`. The reconciler only reads the
 * result switch name, so the fixture implements just that accessor instead of
 * building a full XDR envelope.
 */
function transactionResultStub(switchName: string): never {
  return {
    result: () => ({ switch: () => ({ name: switchName }) }),
  } as never;
}

export function successfulTransactionResponse(
  overrides: { ledger?: number; latestLedger?: number } = {},
): rpc.Api.GetTransactionResponse {
  return {
    status: rpc.Api.GetTransactionStatus.SUCCESS,
    ledger: overrides.ledger ?? 1200,
    latestLedger: overrides.latestLedger ?? 1205,
    latestLedgerCloseTime: 1700000000,
    oldestLedger: 900,
    oldestLedgerCloseTime: 1699000000,
    createdAt: 1700000000,
    applicationOrder: 1,
    feeBump: false,
    envelopeXdr: transactionResultStub('txSuccess'),
    resultXdr: transactionResultStub('txSuccess'),
    resultMetaXdr: transactionResultStub('txSuccess'),
  } as unknown as rpc.Api.GetTransactionResponse;
}

export function failedTransactionResponse(
  overrides: { ledger?: number; switchName?: string } = {},
): rpc.Api.GetTransactionResponse {
  return {
    status: rpc.Api.GetTransactionStatus.FAILED,
    ledger: overrides.ledger ?? 1300,
    latestLedger: 1305,
    latestLedgerCloseTime: 1700000100,
    oldestLedger: 900,
    oldestLedgerCloseTime: 1699000000,
    createdAt: 1700000100,
    applicationOrder: 2,
    feeBump: false,
    envelopeXdr: transactionResultStub('txFailed'),
    resultXdr: transactionResultStub(overrides.switchName ?? 'txFailed'),
    resultMetaXdr: transactionResultStub('txFailed'),
  } as unknown as rpc.Api.GetTransactionResponse;
}

export function missingTransactionResponse(
  overrides: { latestLedger?: number } = {},
): rpc.Api.GetTransactionResponse {
  return {
    status: rpc.Api.GetTransactionStatus.NOT_FOUND,
    latestLedger: overrides.latestLedger ?? 1400,
    latestLedgerCloseTime: 1700000200,
    oldestLedger: 900,
    oldestLedgerCloseTime: 1699000000,
  } as unknown as rpc.Api.GetTransactionResponse;
}

export function sendTransactionResponse(
  status: rpc.Api.SendTransactionStatus,
  overrides: { hash?: string; withErrorResult?: boolean } = {},
): rpc.Api.SendTransactionResponse {
  return {
    status,
    hash: overrides.hash ?? TRANSACTION_HASHES.pending,
    latestLedger: 1500,
    latestLedgerCloseTime: 1700000300,
    ...(overrides.withErrorResult
      ? { errorResult: transactionResultStub('txInsufficientBalance') }
      : {}),
  } as unknown as rpc.Api.SendTransactionResponse;
}
