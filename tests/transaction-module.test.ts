import { AegisClient } from '../src/client';
import { TransactionModule } from '../src/transactions/module';
import {
  TRANSACTION_HASHES,
  failedTransactionResponse,
  missingTransactionResponse,
  sendTransactionResponse,
  successfulTransactionResponse,
} from './fixtures/transaction-results';

jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...original,
    rpc: {
      ...original.rpc,
      Server: jest.fn().mockImplementation(() => ({
        getTransaction: jest.fn(),
        sendTransaction: jest.fn(),
      })),
    },
  };
});

describe('TransactionModule', () => {
  let client: AegisClient;
  let transaction: TransactionModule;
  let mockGetTransaction: jest.Mock;
  let mockSendTransaction: jest.Mock;
  let sleep: jest.Mock;
  let delays: number[];

  beforeEach(() => {
    client = new AegisClient({
      environment: 'testnet',
      contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
    });
    transaction = client.transaction;
    mockGetTransaction = client.rpcServer.getTransaction as jest.Mock;
    mockSendTransaction = client.rpcServer.sendTransaction as jest.Mock;
    delays = [];
    sleep = jest.fn(async (milliseconds: number) => {
      delays.push(milliseconds);
    });
  });

  it('is wired onto the client', () => {
    expect(client.transaction).toBeInstanceOf(TransactionModule);
  });

  it('reads a single observation without polling', async () => {
    mockGetTransaction.mockResolvedValue(
      successfulTransactionResponse({ ledger: 1210 }),
    );

    const result = await transaction.getResult(TRANSACTION_HASHES.confirmed);

    expect(mockGetTransaction).toHaveBeenCalledTimes(1);
    expect(mockGetTransaction).toHaveBeenCalledWith(
      TRANSACTION_HASHES.confirmed,
    );
    expect(result).toMatchObject({ status: 'confirmed', ledger: 1210 });
  });

  it('polls until inclusion is confirmed', async () => {
    mockGetTransaction
      .mockResolvedValueOnce(missingTransactionResponse())
      .mockResolvedValueOnce(missingTransactionResponse())
      .mockResolvedValueOnce(successfulTransactionResponse({ ledger: 1220 }));

    const result = await transaction.waitForResult(
      TRANSACTION_HASHES.confirmed,
      { intervalMs: 100, sleep },
    );

    expect(result).toMatchObject({
      status: 'confirmed',
      code: 'CONFIRMED',
      terminal: true,
      attempts: 3,
      ledger: 1220,
    });
    expect(mockGetTransaction).toHaveBeenCalledTimes(3);
  });

  it('stops polling as soon as a ledger failure is observed', async () => {
    mockGetTransaction
      .mockResolvedValueOnce(missingTransactionResponse())
      .mockResolvedValueOnce(failedTransactionResponse({ ledger: 1330 }))
      .mockResolvedValueOnce(successfulTransactionResponse());

    const result = await transaction.waitForResult(TRANSACTION_HASHES.failed, {
      intervalMs: 50,
      sleep,
    });

    expect(result).toMatchObject({
      status: 'failed',
      code: 'LEDGER_FAILURE',
      terminal: true,
      attempts: 2,
      failureCode: 'TX_FAILED',
    });
    expect(mockGetTransaction).toHaveBeenCalledTimes(2);
  });

  it('ends an exhausted window as unknown instead of failed', async () => {
    mockGetTransaction.mockResolvedValue(missingTransactionResponse());

    const result = await transaction.waitForResult(TRANSACTION_HASHES.pending, {
      maxAttempts: 3,
      intervalMs: 100,
      sleep,
    });

    expect(result).toMatchObject({
      status: 'unknown',
      code: 'OBSERVATION_WINDOW_EXPIRED',
      terminal: false,
      safeToResubmit: false,
      attempts: 3,
    });
    expect(mockGetTransaction).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('never submits or resubmits while reconciling', async () => {
    mockGetTransaction.mockResolvedValue(missingTransactionResponse());

    await transaction.waitForResult(TRANSACTION_HASHES.pending, {
      maxAttempts: 4,
      intervalMs: 10,
      sleep,
    });
    await transaction.getResult(TRANSACTION_HASHES.pending);

    expect(mockSendTransaction).not.toHaveBeenCalled();
  });

  it('applies bounded exponential backoff between observations', async () => {
    mockGetTransaction.mockResolvedValue(missingTransactionResponse());

    await transaction.waitForResult(TRANSACTION_HASHES.pending, {
      maxAttempts: 5,
      intervalMs: 100,
      backoffFactor: 3,
      maxIntervalMs: 500,
      sleep,
    });

    expect(delays).toEqual([100, 300, 500, 500]);
  });

  it('surfaces RPC problems as typed network failures', async () => {
    mockGetTransaction.mockRejectedValue(
      Object.assign(new Error('rpc url contains secret'), {
        code: 'ETIMEDOUT',
      }),
    );

    await expect(
      transaction.waitForResult(TRANSACTION_HASHES.pending, { sleep }),
    ).rejects.toMatchObject({
      name: 'NetworkFailure',
      code: 'TIMEOUT',
      retryable: true,
    });
  });

  it('rejects malformed hashes and poll options before contacting RPC', async () => {
    await expect(transaction.getResult('C...')).rejects.toMatchObject({
      code: 'INVALID_TRANSACTION_HASH',
    });
    await expect(
      transaction.waitForResult(TRANSACTION_HASHES.pending, { maxAttempts: 0 }),
    ).rejects.toMatchObject({ code: 'INVALID_POLL_OPTIONS' });
    await expect(
      transaction.waitForResult(TRANSACTION_HASHES.pending, {
        intervalMs: 1000,
        maxIntervalMs: 100,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_POLL_OPTIONS' });

    expect(mockGetTransaction).not.toHaveBeenCalled();
  });

  it('reconciles a submission response without any RPC read', () => {
    const rejected = transaction.reconcileSubmission(
      sendTransactionResponse('ERROR', {
        hash: TRANSACTION_HASHES.rejected,
        withErrorResult: true,
      }),
    );

    expect(rejected).toMatchObject({
      status: 'rejected',
      terminal: true,
      safeToResubmit: true,
    });
    expect(mockGetTransaction).not.toHaveBeenCalled();
  });

  it('delegates plain reconciliation to the shared helper', () => {
    const result = transaction.reconcile({
      hash: TRANSACTION_HASHES.pending,
      status: 'DUPLICATE',
    });

    expect(result.code).toBe('SUBMISSION_DUPLICATE');
  });
});
