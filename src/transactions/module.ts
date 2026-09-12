import { rpc } from '@stellar/stellar-sdk';
import { AegisClient } from '../client';
import { TransactionReconciliationError } from '../errors/transaction';
import {
  ReconcileTransactionResponseOptions,
  ReconcileTransactionStatusInput,
  TransactionResult,
  WaitForTransactionOptions,
} from '../types/transaction-result';
import {
  normalizeTransactionHash,
  reconcileGetTransactionResponse,
  reconcileSendTransactionResponse,
  reconcileTransactionStatus,
} from './reconciliation';

const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_INTERVAL_MS = 1000;
const DEFAULT_BACKOFF_FACTOR = 1.5;
const DEFAULT_MAX_INTERVAL_MS = 8000;

interface PollSettings {
  maxAttempts: number;
  intervalMs: number;
  backoffFactor: number;
  maxIntervalMs: number;
  sleep: (milliseconds: number) => Promise<void>;
}

/**
 * Reconciles submitted Soroban transactions into typed, stable outcomes.
 *
 * This module only reads transaction state. It never signs, submits, or
 * resubmits a transaction, so polling cannot cause duplicate ledger effects.
 */
export class TransactionModule {
  private client: AegisClient;

  constructor(client: AegisClient) {
    this.client = client;
  }

  /**
   * Reconciles an already-known hash and status without contacting RPC.
   */
  public reconcile(input: ReconcileTransactionStatusInput): TransactionResult {
    return reconcileTransactionStatus(input);
  }

  /**
   * Reconciles a `sendTransaction` response into a typed submission outcome.
   */
  public reconcileSubmission(
    response: rpc.Api.SendTransactionResponse,
    options?: ReconcileTransactionResponseOptions,
  ): TransactionResult {
    return reconcileSendTransactionResponse(response, options);
  }

  /**
   * Reads the current state of a transaction with a single RPC observation.
   *
   * A `pending` result means "not observed yet", not "failed".
   */
  public async getResult(hash: string): Promise<TransactionResult> {
    const normalizedHash = normalizeTransactionHash(hash);
    const response = await this.client.runNetworkOperation(() =>
      this.client.rpcServer.getTransaction(normalizedHash),
    );

    return reconcileGetTransactionResponse(normalizedHash, response);
  }

  /**
   * Polls `getTransaction` until the outcome is terminal or the bounded
   * observation window ends.
   *
   * Returns `confirmed`, `failed`, or `rejected` when terminal. Returns
   * `unknown` with code `OBSERVATION_WINDOW_EXPIRED` when the window ends
   * without inclusion — callers must reconcile the same hash again rather than
   * resubmitting.
   */
  public async waitForResult(
    hash: string,
    options: WaitForTransactionOptions = {},
  ): Promise<TransactionResult> {
    const normalizedHash = normalizeTransactionHash(hash);
    const settings = resolvePollSettings(options);

    let delayMs = settings.intervalMs;
    let lastResult: TransactionResult | undefined;

    for (let attempt = 1; attempt <= settings.maxAttempts; attempt += 1) {
      const response = await this.client.runNetworkOperation(() =>
        this.client.rpcServer.getTransaction(normalizedHash),
      );

      lastResult = reconcileGetTransactionResponse(normalizedHash, response, {
        attempts: attempt,
      });

      if (lastResult.terminal) {
        return lastResult;
      }

      if (attempt < settings.maxAttempts) {
        await settings.sleep(delayMs);
        delayMs = Math.min(
          Math.ceil(delayMs * settings.backoffFactor),
          settings.maxIntervalMs,
        );
      }
    }

    return reconcileTransactionStatus({
      hash: normalizedHash,
      status: lastResult?.rpcStatus ?? rpc.Api.GetTransactionStatus.NOT_FOUND,
      attempts: settings.maxAttempts,
      latestLedger: lastResult?.latestLedger,
      observationWindowExpired: true,
    });
  }
}

function resolvePollSettings(options: WaitForTransactionOptions): PollSettings {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const backoffFactor = options.backoffFactor ?? DEFAULT_BACKOFF_FACTOR;
  const maxIntervalMs = options.maxIntervalMs ?? DEFAULT_MAX_INTERVAL_MS;

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new TransactionReconciliationError(
      'INVALID_POLL_OPTIONS',
      'maxAttempts must be a positive integer.',
    );
  }

  if (!Number.isFinite(intervalMs) || intervalMs < 0) {
    throw new TransactionReconciliationError(
      'INVALID_POLL_OPTIONS',
      'intervalMs must be a non-negative number.',
    );
  }

  if (!Number.isFinite(backoffFactor) || backoffFactor < 1) {
    throw new TransactionReconciliationError(
      'INVALID_POLL_OPTIONS',
      'backoffFactor must be greater than or equal to 1.',
    );
  }

  if (!Number.isFinite(maxIntervalMs) || maxIntervalMs < intervalMs) {
    throw new TransactionReconciliationError(
      'INVALID_POLL_OPTIONS',
      'maxIntervalMs must be greater than or equal to intervalMs.',
    );
  }

  return {
    maxAttempts,
    intervalMs,
    backoffFactor,
    maxIntervalMs,
    sleep: options.sleep ?? defaultSleep,
  };
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
