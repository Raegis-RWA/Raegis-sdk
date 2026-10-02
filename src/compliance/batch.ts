import { StrKey } from '@stellar/stellar-sdk';
import { buildNetworkFailureDiagnostic } from '../diagnostics/network';
import { ComplianceBatchError } from '../errors/compliance';
import {
  ComplianceBatchFailedItem,
  ComplianceBatchInvalidItem,
  ComplianceBatchItem,
  ComplianceBatchOptions,
  ComplianceBatchResolvedItem,
  ComplianceBatchResult,
} from '../types/compliance-batch';

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_BATCH_SIZE = 100;
const MAX_CONCURRENCY = 20;
const MAX_BATCH_SIZE_LIMIT = 1000;

interface ResolvedOptions {
  concurrency: number;
  deduplicate: boolean;
  maxBatchSize: number;
}

interface QueryTask {
  address: string;
  indices: number[];
}

type WhitelistQuery = (address: string) => Promise<boolean>;

/**
 * Executes compliance checks with bounded concurrency and per-item isolation.
 *
 * This helper does not retry automatically. A retry can multiply provider load,
 * especially during rate limiting; callers should inspect diagnostics and retry
 * only failed items after an appropriate delay.
 */
export async function executeComplianceBatch(
  addresses: readonly string[],
  queryWhitelist: WhitelistQuery,
  options: ComplianceBatchOptions = {},
): Promise<ComplianceBatchResult> {
  if (!Array.isArray(addresses)) {
    throw new ComplianceBatchError(
      'INVALID_BATCH_INPUT',
      'Compliance batch input must be an array of addresses.',
    );
  }

  const settings = resolveOptions(options);
  if (addresses.length > settings.maxBatchSize) {
    throw new ComplianceBatchError(
      'BATCH_TOO_LARGE',
      `Compliance batch cannot exceed ${settings.maxBatchSize} items.`,
    );
  }

  const startedAt = Date.now();
  const fetchedAt = new Date(startedAt).toISOString();
  const items: Array<ComplianceBatchItem | undefined> = new Array(
    addresses.length,
  );
  const tasks = buildTasks(addresses, settings.deduplicate, items);

  let cursor = 0;
  const workerCount = Math.min(settings.concurrency, tasks.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor];
      cursor += 1;
      await executeTask(task, queryWhitelist, items);
    }
  });

  await Promise.all(workers);

  const orderedItems = items.map((item) => {
    if (!item) {
      throw new ComplianceBatchError(
        'INVALID_BATCH_INPUT',
        'Compliance batch could not map every input item.',
      );
    }
    return item;
  });

  const whitelisted = countStatus(orderedItems, 'whitelisted');
  const notWhitelisted = countStatus(orderedItems, 'not-whitelisted');
  const invalid = countStatus(orderedItems, 'invalid-address');
  const failed = countStatus(orderedItems, 'failed');
  const resolved = whitelisted + notWhitelisted;
  const validItems = resolved + failed;
  const rateLimited = orderedItems.some(
    (item) =>
      item.status === 'failed' && item.diagnostic.code === 'RATE_LIMITED',
  );

  const summary = Object.freeze({
    requested: addresses.length,
    queried: tasks.length,
    whitelisted,
    notWhitelisted,
    invalid,
    failed,
    duplicates: orderedItems.filter((item) => item.duplicate).length,
    partial: failed > 0 && resolved > 0,
    exhausted: validItems > 0 && failed === validItems,
    rateLimited,
    durationMs: Math.max(0, Date.now() - startedAt),
  });

  return Object.freeze({
    items: Object.freeze(orderedItems),
    summary,
    fetchedAt,
  });
}

function buildTasks(
  addresses: readonly string[],
  deduplicate: boolean,
  items: Array<ComplianceBatchItem | undefined>,
): QueryTask[] {
  const tasks: QueryTask[] = [];
  const taskByAddress = new Map<string, QueryTask>();

  addresses.forEach((value, index) => {
    const invalid = validateAddress(value, index);
    if (invalid) {
      items[index] = invalid;
      return;
    }

    if (deduplicate) {
      const existing = taskByAddress.get(value);
      if (existing) {
        existing.indices.push(index);
        return;
      }
    }

    const task = { address: value, indices: [index] };
    tasks.push(task);
    if (deduplicate) {
      taskByAddress.set(value, task);
    }
  });

  return tasks;
}

async function executeTask(
  task: QueryTask,
  queryWhitelist: WhitelistQuery,
  items: Array<ComplianceBatchItem | undefined>,
): Promise<void> {
  try {
    const isWhitelisted = await queryWhitelist(task.address);
    task.indices.forEach((index, position) => {
      items[index] = Object.freeze({
        index,
        address: task.address,
        status: isWhitelisted ? 'whitelisted' : 'not-whitelisted',
        code: 'OK',
        isWhitelisted,
        duplicate: position > 0,
        message: isWhitelisted
          ? 'Address is currently present on the protocol whitelist.'
          : 'Address is not currently present on the protocol whitelist.',
      } satisfies ComplianceBatchResolvedItem);
    });
  } catch (error) {
    const diagnostic = buildBatchFailureDiagnostic(error);
    task.indices.forEach((index, position) => {
      items[index] = Object.freeze({
        index,
        address: task.address,
        status: 'failed',
        code: 'COMPLIANCE_QUERY_FAILED',
        isWhitelisted: false,
        duplicate: position > 0,
        message:
          'Compliance status could not be evaluated for this address.',
        diagnostic,
      } satisfies ComplianceBatchFailedItem);
    });
  }
}

function buildBatchFailureDiagnostic(error: unknown) {
  if (
    error instanceof Error &&
    error.message.trim().toUpperCase() === 'XDR PARSING FAILED.'
  ) {
    return buildNetworkFailureDiagnostic(
      new SyntaxError('Invalid XDR response.'),
    );
  }

  return buildNetworkFailureDiagnostic(error);
}

function validateAddress(
  value: unknown,
  index: number,
): ComplianceBatchInvalidItem | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return buildInvalidItem(
      index,
      'INVALID_ADDRESS',
      'Address is missing or invalid.',
    );
  }

  if (StrKey.isValidEd25519PublicKey(value)) {
    return undefined;
  }

  if (StrKey.isValidMed25519PublicKey(value)) {
    return buildInvalidItem(
      index,
      'MUXED_ADDRESS_UNSUPPORTED',
      'Muxed addresses are not supported for compliance checks.',
    );
  }

  if (StrKey.isValidContract(value)) {
    return buildInvalidItem(
      index,
      'CONTRACT_ADDRESS_UNSUPPORTED',
      'Contract addresses cannot be used as investor addresses.',
    );
  }

  return buildInvalidItem(
    index,
    'INVALID_ADDRESS',
    'Address is not a valid Stellar account public key.',
  );
}

function buildInvalidItem(
  index: number,
  code: ComplianceBatchInvalidItem['code'],
  message: string,
): ComplianceBatchInvalidItem {
  return Object.freeze({
    index,
    status: 'invalid-address',
    code,
    isWhitelisted: false,
    duplicate: false,
    message,
  });
}

function resolveOptions(options: ComplianceBatchOptions): ResolvedOptions {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const maxBatchSize = options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE;

  if (
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > MAX_CONCURRENCY
  ) {
    throw new ComplianceBatchError(
      'INVALID_BATCH_OPTIONS',
      `concurrency must be an integer between 1 and ${MAX_CONCURRENCY}.`,
    );
  }

  if (
    !Number.isInteger(maxBatchSize) ||
    maxBatchSize < 1 ||
    maxBatchSize > MAX_BATCH_SIZE_LIMIT
  ) {
    throw new ComplianceBatchError(
      'INVALID_BATCH_OPTIONS',
      `maxBatchSize must be an integer between 1 and ${MAX_BATCH_SIZE_LIMIT}.`,
    );
  }

  if (
    options.deduplicate !== undefined &&
    typeof options.deduplicate !== 'boolean'
  ) {
    throw new ComplianceBatchError(
      'INVALID_BATCH_OPTIONS',
      'deduplicate must be a boolean.',
    );
  }

  return {
    concurrency,
    deduplicate: options.deduplicate ?? true,
    maxBatchSize,
  };
}

function countStatus(
  items: readonly ComplianceBatchItem[],
  status: ComplianceBatchItem['status'],
): number {
  return items.filter((item) => item.status === status).length;
}
