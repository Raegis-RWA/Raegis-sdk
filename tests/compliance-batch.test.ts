import { Keypair, Networks, StrKey } from '@stellar/stellar-sdk';
import {
  AegisClient,
  ComplianceBatchError,
  buildComplianceBatchDiagnostic,
} from '../src';

const ADDRESS_A = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
const ADDRESS_B = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();
const ADDRESS_C = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3)).publicKey();
const CONTRACT_ADDRESS = StrKey.encodeContract(Buffer.alloc(32, 4));
const MUXED_ADDRESS = StrKey.encodeMed25519PublicKey(Buffer.alloc(40, 5));

describe('ComplianceModule.checkWhitelistBatch', () => {
  let client: AegisClient;
  let queryWhitelist: jest.SpyInstance<Promise<boolean>, [string]>;

  beforeEach(() => {
    client = new AegisClient({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: Networks.TESTNET,
      contractId: CONTRACT_ADDRESS,
    });
    queryWhitelist = jest.spyOn(
      client.compliance as unknown as {
        checkWhitelistForBatch(address: string): Promise<boolean>;
      },
      'checkWhitelistForBatch',
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns typed results in input order for mixed valid and invalid input', async () => {
    queryWhitelist.mockImplementation(async (address) => address === ADDRESS_A);

    const result = await client.compliance.checkWhitelistBatch([
      ADDRESS_A,
      '',
      ADDRESS_B,
      'not-a-stellar-address',
      MUXED_ADDRESS,
      CONTRACT_ADDRESS,
    ]);

    expect(result.items.map((item) => [item.index, item.status, item.code])).toEqual([
      [0, 'whitelisted', 'OK'],
      [1, 'invalid-address', 'INVALID_ADDRESS'],
      [2, 'not-whitelisted', 'OK'],
      [3, 'invalid-address', 'INVALID_ADDRESS'],
      [4, 'invalid-address', 'MUXED_ADDRESS_UNSUPPORTED'],
      [5, 'invalid-address', 'CONTRACT_ADDRESS_UNSUPPORTED'],
    ]);
    expect(result.summary).toMatchObject({
      requested: 6,
      queried: 2,
      whitelisted: 1,
      notWhitelisted: 1,
      invalid: 4,
      failed: 0,
      partial: false,
      exhausted: false,
    });
    expect(queryWhitelist).toHaveBeenCalledTimes(2);
  });

  it('omits arbitrary invalid input from serialised results', async () => {
    const result = await client.compliance.checkWhitelistBatch([
      'Bearer secret-token',
    ]);

    expect(result.items[0]).toEqual({
      index: 0,
      status: 'invalid-address',
      code: 'INVALID_ADDRESS',
      isWhitelisted: false,
      duplicate: false,
      message: 'Address is not a valid Stellar account public key.',
    });
    expect(JSON.stringify(result)).not.toContain('secret-token');
    expect(queryWhitelist).not.toHaveBeenCalled();
  });

  it('represents partial failures without rejecting successful items', async () => {
    queryWhitelist.mockImplementation(async (address) => {
      if (address === ADDRESS_B) {
        throw Object.assign(
          new Error('https://rpc.example/?token=secret-value timed out'),
          { code: 'ETIMEDOUT' },
        );
      }
      return true;
    });

    const result = await client.compliance.checkWhitelistBatch([
      ADDRESS_A,
      ADDRESS_B,
      ADDRESS_C,
    ]);

    expect(result.items[0].status).toBe('whitelisted');
    expect(result.items[1]).toMatchObject({
      status: 'failed',
      code: 'COMPLIANCE_QUERY_FAILED',
      isWhitelisted: false,
      diagnostic: {
        code: 'TIMEOUT',
        retryable: true,
        action: 'retry',
      },
    });
    expect(result.items[2].status).toBe('whitelisted');
    expect(result.summary).toMatchObject({
      whitelisted: 2,
      failed: 1,
      partial: true,
      exhausted: false,
    });
    expect(JSON.stringify(result)).not.toContain('secret-value');
    expect(JSON.stringify(result)).not.toContain('rpc.example');
  });

  it('marks the batch exhausted when every valid query fails', async () => {
    queryWhitelist.mockRejectedValue(new Error('unknown private failure'));

    const result = await client.compliance.checkWhitelistBatch([
      ADDRESS_A,
      ADDRESS_B,
    ]);

    expect(result.summary).toMatchObject({
      queried: 2,
      failed: 2,
      partial: false,
      exhausted: true,
    });
  });

  it('deduplicates valid addresses while preserving one item per input', async () => {
    queryWhitelist.mockResolvedValue(true);

    const result = await client.compliance.checkWhitelistBatch([
      ADDRESS_A,
      ADDRESS_B,
      ADDRESS_A,
      ADDRESS_A,
    ]);

    expect(queryWhitelist).toHaveBeenCalledTimes(2);
    expect(result.items).toHaveLength(4);
    expect(result.items.map((item) => item.index)).toEqual([0, 1, 2, 3]);
    expect(result.items.map((item) => item.duplicate)).toEqual([
      false,
      false,
      true,
      true,
    ]);
    expect(result.summary).toMatchObject({ queried: 2, duplicates: 2 });
  });

  it('can disable deduplication explicitly', async () => {
    queryWhitelist.mockResolvedValue(false);

    const result = await client.compliance.checkWhitelistBatch(
      [ADDRESS_A, ADDRESS_A],
      { deduplicate: false },
    );

    expect(queryWhitelist).toHaveBeenCalledTimes(2);
    expect(result.summary).toMatchObject({ queried: 2, duplicates: 0 });
  });

  it('respects the configured concurrency bound', async () => {
    let inFlight = 0;
    let peakInFlight = 0;
    queryWhitelist.mockImplementation(async () => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return true;
    });

    await client.compliance.checkWhitelistBatch(
      [ADDRESS_A, ADDRESS_B, ADDRESS_C],
      { concurrency: 2 },
    );

    expect(peakInFlight).toBe(2);
  });

  it('returns an empty frozen result for an empty batch', async () => {
    const result = await client.compliance.checkWhitelistBatch([]);

    expect(result.items).toEqual([]);
    expect(result.summary).toMatchObject({
      requested: 0,
      queried: 0,
      invalid: 0,
      failed: 0,
      partial: false,
      exhausted: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.items)).toBe(true);
    expect(Object.isFrozen(result.summary)).toBe(true);
  });

  it('validates batch size and options before querying', async () => {
    await expect(
      client.compliance.checkWhitelistBatch([ADDRESS_A, ADDRESS_B], {
        maxBatchSize: 1,
      }),
    ).rejects.toMatchObject({
      name: 'ComplianceBatchError',
      code: 'BATCH_TOO_LARGE',
    });

    await expect(
      client.compliance.checkWhitelistBatch([ADDRESS_A], { concurrency: 0 }),
    ).rejects.toBeInstanceOf(ComplianceBatchError);
    await expect(
      client.compliance.checkWhitelistBatch([ADDRESS_A], { concurrency: 21 }),
    ).rejects.toMatchObject({ code: 'INVALID_BATCH_OPTIONS' });
    expect(queryWhitelist).not.toHaveBeenCalled();
  });

  it('does not misreport an unsuccessful simulation as not whitelisted', async () => {
    queryWhitelist.mockRestore();
    jest
      .spyOn(client.rpcServer, 'simulateTransaction')
      .mockResolvedValue({ error: 'contract simulation failed' } as never);

    const result = await client.compliance.checkWhitelistBatch([ADDRESS_A]);

    expect(result.items[0]).toMatchObject({
      status: 'failed',
      code: 'COMPLIANCE_QUERY_FAILED',
      diagnostic: {
        code: 'MALFORMED_RESPONSE',
        retryable: false,
      },
    });
    expect(result.summary.notWhitelisted).toBe(0);
    expect(result.summary.failed).toBe(1);
  });

  it('classifies malformed response failures safely per item', async () => {
    queryWhitelist.mockRejectedValue(new Error('XDR Parsing failed.'));

    const result = await client.compliance.checkWhitelistBatch([ADDRESS_A]);
    const item = result.items[0];

    expect(item).toMatchObject({
      status: 'failed',
      diagnostic: {
        code: 'MALFORMED_RESPONSE',
        retryable: false,
      },
    });
  });
});

describe('buildComplianceBatchDiagnostic', () => {
  it('produces an address-free rate-limit roll-up with retry guidance', async () => {
    const client = new AegisClient({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: Networks.TESTNET,
      contractId: CONTRACT_ADDRESS,
    });
    jest.spyOn(
      client.compliance as unknown as {
        checkWhitelistForBatch(address: string): Promise<boolean>;
      },
      'checkWhitelistForBatch',
    ).mockImplementation(async (address) => {
        if (address === ADDRESS_B) {
          throw {
            response: { status: 429 },
            retryAfterSeconds: 2.2,
            message: 'Too many requests; authorization=secret-token',
          };
        }
        return true;
      });

    const result = await client.compliance.checkWhitelistBatch([
      ADDRESS_A,
      ADDRESS_B,
      'private-invalid-input',
    ]);
    const diagnostic = buildComplianceBatchDiagnostic(result);

    expect(diagnostic).toEqual({
      requested: 3,
      queried: 2,
      failed: 1,
      invalid: 1,
      partial: true,
      exhausted: false,
      rateLimited: true,
      failureCodes: { RATE_LIMITED: 1 },
      action: 'retry-with-backoff',
      retryAfterSeconds: 3,
    });
    expect(Object.isFrozen(diagnostic)).toBe(true);
    expect(Object.isFrozen(diagnostic.failureCodes)).toBe(true);
    expect(JSON.stringify(diagnostic)).not.toContain(ADDRESS_A);
    expect(JSON.stringify(diagnostic)).not.toContain(ADDRESS_B);
    expect(JSON.stringify(diagnostic)).not.toContain('private-invalid-input');
    expect(JSON.stringify(diagnostic)).not.toContain('secret-token');
  });

  it('recommends reviewing invalid input when no RPC query fails', async () => {
    const client = new AegisClient({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: Networks.TESTNET,
      contractId: CONTRACT_ADDRESS,
    });
    const result = await client.compliance.checkWhitelistBatch(['invalid']);

    expect(buildComplianceBatchDiagnostic(result).action).toBe(
      'review-invalid-input',
    );
  });
});
