import { rpc } from '@stellar/stellar-sdk';
import {
  TransactionReconciliationError,
  decodeTransactionResultCode,
  normalizeTransactionHash,
  normalizeTransactionResultStatus,
  reconcileGetTransactionResponse,
  reconcileSendTransactionResponse,
  reconcileTransactionStatus,
} from '../src';
import {
  TRANSACTION_HASHES,
  failedTransactionResponse,
  missingTransactionResponse,
  sendTransactionResponse,
  successfulTransactionResponse,
} from './fixtures/transaction-results';

describe('Transaction status normalization', () => {
  it.each([
    ['SUCCESS', 'confirmed'],
    ['FAILED', 'failed'],
    ['NOT_FOUND', 'pending'],
    ['PENDING', 'pending'],
    ['DUPLICATE', 'pending'],
    ['ERROR', 'rejected'],
    ['TRY_AGAIN_LATER', 'unknown'],
  ] as const)('maps %s to %s', (rpcStatus, expected) => {
    expect(normalizeTransactionResultStatus(rpcStatus)).toBe(expected);
  });

  it('treats an unrecognised future status as unknown rather than success', () => {
    expect(normalizeTransactionResultStatus('ARCHIVED_PENDING_RESTORE')).toBe(
      'unknown',
    );
  });

  it('accepts lowercase and padded status strings', () => {
    expect(normalizeTransactionResultStatus('  success ')).toBe('confirmed');
  });
});

describe('decodeTransactionResultCode', () => {
  function resultStub(name: unknown): unknown {
    return { result: () => ({ switch: () => ({ name }) }) };
  }

  it('converts a result switch name into a stable uppercase code', () => {
    expect(decodeTransactionResultCode(resultStub('txFailed'))).toBe(
      'TX_FAILED',
    );
    expect(
      decodeTransactionResultCode(resultStub('txInsufficientBalance')),
    ).toBe('TX_INSUFFICIENT_BALANCE');
  });

  it.each([
    ['a missing result', undefined],
    ['a null result', null],
    ['an unreadable shape', {}],
    ['a non-string switch name', resultStub(42)],
    ['an empty switch name', resultStub('')],
  ])('returns undefined for %s', (_label, input) => {
    expect(decodeTransactionResultCode(input)).toBeUndefined();
  });

  it('swallows accessors that throw instead of propagating XDR errors', () => {
    const hostile = {
      result: () => {
        throw new Error('raw xdr access failed');
      },
    };

    expect(decodeTransactionResultCode(hostile)).toBeUndefined();
  });
});

describe('reconcileTransactionStatus', () => {
  const hash = TRANSACTION_HASHES.confirmed;

  it('marks a confirmed transaction terminal and not resubmittable', () => {
    const result = reconcileTransactionStatus({
      hash,
      status: 'SUCCESS',
      ledger: 1200,
      observedAt: '2026-07-29T00:00:00.000Z',
    });

    expect(result).toMatchObject({
      hash,
      status: 'confirmed',
      code: 'CONFIRMED',
      rpcStatus: 'SUCCESS',
      terminal: true,
      safeToResubmit: false,
      ledger: 1200,
      attempts: 1,
      observedAt: '2026-07-29T00:00:00.000Z',
    });
  });

  it('marks a ledger failure terminal without inviting resubmission', () => {
    const result = reconcileTransactionStatus({ hash, status: 'FAILED' });

    expect(result.status).toBe('failed');
    expect(result.code).toBe('LEDGER_FAILURE');
    expect(result.terminal).toBe(true);
    expect(result.safeToResubmit).toBe(false);
  });

  it('keeps a missing transaction pending because absence is not failure', () => {
    const result = reconcileTransactionStatus({ hash, status: 'NOT_FOUND' });

    expect(result.status).toBe('pending');
    expect(result.code).toBe('AWAITING_INCLUSION');
    expect(result.terminal).toBe(false);
    expect(result.safeToResubmit).toBe(false);
  });

  it('treats a duplicate submission as pending on the existing hash', () => {
    const result = reconcileTransactionStatus({ hash, status: 'DUPLICATE' });

    expect(result.status).toBe('pending');
    expect(result.code).toBe('SUBMISSION_DUPLICATE');
    expect(result.safeToResubmit).toBe(false);
    expect(result.summary).toContain('instead of resubmitting');
  });

  it('marks a pre-inclusion rejection as the only resubmittable state', () => {
    const result = reconcileTransactionStatus({ hash, status: 'ERROR' });

    expect(result.status).toBe('rejected');
    expect(result.code).toBe('SUBMISSION_REJECTED');
    expect(result.terminal).toBe(true);
    expect(result.safeToResubmit).toBe(true);
  });

  it('treats throttled submissions as indeterminate, not retryable', () => {
    const result = reconcileTransactionStatus({
      hash,
      status: 'TRY_AGAIN_LATER',
    });

    expect(result.status).toBe('unknown');
    expect(result.code).toBe('SUBMISSION_THROTTLED');
    expect(result.safeToResubmit).toBe(false);
  });

  it('converts a pending reading into unknown when the window expires', () => {
    const result = reconcileTransactionStatus({
      hash,
      status: 'NOT_FOUND',
      attempts: 5,
      observationWindowExpired: true,
    });

    expect(result.status).toBe('unknown');
    expect(result.code).toBe('OBSERVATION_WINDOW_EXPIRED');
    expect(result.terminal).toBe(false);
    expect(result.safeToResubmit).toBe(false);
    expect(result.attempts).toBe(5);
  });

  it('does not downgrade a terminal outcome when the window expires', () => {
    const result = reconcileTransactionStatus({
      hash,
      status: 'SUCCESS',
      observationWindowExpired: true,
    });

    expect(result.status).toBe('confirmed');
  });

  it('normalizes hashes and rejects malformed ones', () => {
    expect(
      normalizeTransactionHash(` ${TRANSACTION_HASHES.failed.toUpperCase()} `),
    ).toBe(TRANSACTION_HASHES.failed);

    expect(() => reconcileTransactionStatus({ hash: 'C...', status: 'SUCCESS' }))
      .toThrow(TransactionReconciliationError);
    expect(() =>
      reconcileTransactionStatus({ hash: 'C...', status: 'SUCCESS' }),
    ).toThrow(
      expect.objectContaining({ code: 'INVALID_TRANSACTION_HASH' }),
    );
  });

  it('rejects empty statuses and non-positive attempt counts', () => {
    expect(() => reconcileTransactionStatus({ hash, status: '  ' })).toThrow(
      expect.objectContaining({ code: 'INVALID_STATUS' }),
    );
    expect(() =>
      reconcileTransactionStatus({ hash, status: 'SUCCESS', attempts: 0 }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_POLL_OPTIONS' }));
    expect(() =>
      reconcileTransactionStatus({
        hash,
        status: 'SUCCESS',
        observedAt: 'not-a-date',
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_TIMESTAMP' }));
  });

  it('returns a frozen result so dashboards cannot mutate receipts', () => {
    const result = reconcileTransactionStatus({ hash, status: 'SUCCESS' });

    expect(Object.isFrozen(result)).toBe(true);
  });
});

describe('reconcileSendTransactionResponse', () => {
  it('reconciles an accepted submission as pending', () => {
    const response = sendTransactionResponse('PENDING');
    const result = reconcileSendTransactionResponse(response);

    expect(result).toMatchObject({
      hash: TRANSACTION_HASHES.pending,
      status: 'pending',
      code: 'AWAITING_INCLUSION',
      rpcStatus: 'PENDING',
      latestLedger: 1500,
    });
  });

  it('reconciles a rejected submission and exposes a safe failure code', () => {
    const response = sendTransactionResponse('ERROR', {
      hash: TRANSACTION_HASHES.rejected,
      withErrorResult: true,
    });
    const result = reconcileSendTransactionResponse(response);

    expect(result.status).toBe('rejected');
    expect(result.failureCode).toBe('TX_INSUFFICIENT_BALANCE');
  });
});

describe('reconcileGetTransactionResponse', () => {
  const hash = TRANSACTION_HASHES.confirmed;

  it('reconciles a successful ledger inclusion', () => {
    const result = reconcileGetTransactionResponse(
      hash,
      successfulTransactionResponse({ ledger: 1201, latestLedger: 1207 }),
      { attempts: 3 },
    );

    expect(result).toMatchObject({
      status: 'confirmed',
      ledger: 1201,
      latestLedger: 1207,
      attempts: 3,
    });
    expect(result.failureCode).toBeUndefined();
  });

  it('reconciles a ledger failure with the result switch name', () => {
    const result = reconcileGetTransactionResponse(
      TRANSACTION_HASHES.failed,
      failedTransactionResponse({ switchName: 'txBadAuth' }),
    );

    expect(result.status).toBe('failed');
    expect(result.failureCode).toBe('TX_BAD_AUTH');
  });

  it('omits ledger details for a missing transaction', () => {
    const result = reconcileGetTransactionResponse(
      TRANSACTION_HASHES.pending,
      missingTransactionResponse({ latestLedger: 1444 }),
    );

    expect(result.status).toBe('pending');
    expect(result.ledger).toBeUndefined();
    expect(result.latestLedger).toBe(1444);
  });

  it('never copies raw XDR payloads into the reconciled result', () => {
    const result = reconcileGetTransactionResponse(
      hash,
      successfulTransactionResponse(),
    );

    expect(Object.keys(result)).toEqual([
      'hash',
      'status',
      'code',
      'rpcStatus',
      'terminal',
      'safeToResubmit',
      'summary',
      'observedAt',
      'attempts',
      'ledger',
      'latestLedger',
    ]);
    expect(JSON.stringify(result)).not.toContain('envelopeXdr');
  });

  it('accepts the RPC status enum values directly', () => {
    expect(
      reconcileTransactionStatus({
        hash,
        status: rpc.Api.GetTransactionStatus.NOT_FOUND,
      }).status,
    ).toBe('pending');
  });
});
