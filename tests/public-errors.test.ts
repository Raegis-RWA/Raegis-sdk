import { Keypair, Networks } from '@stellar/stellar-sdk';
import {
  AdminReceiptError,
  AegisClient,
  AegisSdkError,
  EventDecodeError,
  NetworkFailure,
  PortfolioError,
  normalizeAegisSdkError,
} from '../src';

describe('public SDK error taxonomy', () => {
  it('serializes only safe public fields and metadata', () => {
    const error = new AegisSdkError({
      code: 'ASSET_MINT_FAILED',
      category: 'asset',
      message: 'Mint transaction failed.',
      metadata: {
        operation: 'mint',
        attempts: 2,
        token: 'secret-token',
        authorization: 'Bearer secret',
        nested: { privateKey: 'secret' },
      },
      cause: new Error('raw provider payload contains secret-token'),
    });

    expect(error.code).toBe('ASSET_MINT_FAILED');
    expect(error.category).toBe('asset');
    expect(error.metadata).toEqual({
      operation: 'mint',
      attempts: 2,
    });
    expect(JSON.stringify(error)).not.toContain('secret');
    expect(Object.keys(error)).not.toContain('cause');
  });

  it('normalizes unknown failures without copying their raw messages', () => {
    const error = normalizeAegisSdkError(
      new Error('https://rpc.example/?token=private-value'),
      {
        code: 'COMPLIANCE_QUERY_FAILED',
        category: 'compliance',
        message: 'The compliance status query failed.',
      },
    );

    expect(error).toMatchObject({
      code: 'COMPLIANCE_QUERY_FAILED',
      category: 'compliance',
      message: 'The compliance status query failed.',
    });
    expect(JSON.stringify(error)).not.toContain('private-value');
  });

  it('normalizes compliance query failures into the public taxonomy', async () => {
    const client = new AegisClient({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: Networks.TESTNET,
      contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      keypair: Keypair.random(),
    });
    const simulateTransaction = jest.spyOn(
      client.rpcServer,
      'simulateTransaction',
    );

    simulateTransaction.mockRejectedValueOnce(
      new Error('raw-provider-detail-should-not-leak'),
    );

    const rpcFailure = await client.compliance
      .checkWhitelist(Keypair.random().publicKey())
      .catch((caught) => caught);

    expect(rpcFailure).toBeInstanceOf(AegisSdkError);
    expect(rpcFailure).toMatchObject({
      code: 'COMPLIANCE_QUERY_FAILED',
      category: 'compliance',
      message: 'The compliance status query failed.',
      metadata: { operation: 'checkWhitelist' },
    });
    expect(JSON.stringify(rpcFailure)).not.toContain(
      'raw-provider-detail-should-not-leak',
    );

    simulateTransaction.mockResolvedValueOnce({
      error: 'raw-simulation-detail-should-not-leak',
    } as any);

    const unsuccessfulSimulation = await client.compliance
      .checkWhitelist(Keypair.random().publicKey())
      .catch((caught) => caught);

    expect(unsuccessfulSimulation).toBeInstanceOf(AegisSdkError);
    expect(unsuccessfulSimulation).toMatchObject({
      code: 'COMPLIANCE_QUERY_FAILED',
      category: 'compliance',
      message: 'The compliance status query failed.',
      metadata: { operation: 'checkWhitelist' },
    });
    expect(JSON.stringify(unsuccessfulSimulation)).not.toContain(
      'raw-simulation-detail-should-not-leak',
    );
  });

  it('preserves the common category surface across existing domain errors', () => {
    expect(
      new AdminReceiptError('INVALID_AMOUNT', 'Amount is invalid.').category,
    ).toBe('admin');
    expect(
      new PortfolioError('Portfolio is unavailable.', 'UNAVAILABLE').category,
    ).toBe('investor');
    expect(
      new EventDecodeError('INVALID_EVENT_INPUT', 'Event input is invalid.')
        .category,
    ).toBe('soroban');
    expect(
      new NetworkFailure(
        'The network request timed out.',
        'TIMEOUT',
        true,
      ).category,
    ).toBe('network');
  });

  it('supports transaction and unknown categories without exposing causes', () => {
    const transaction = new AegisSdkError({
      code: 'TRANSACTION_SIGNER_REQUIRED',
      category: 'transaction',
      message: 'A signer is required.',
    });
    const unknown = normalizeAegisSdkError(
      { message: 'secret upstream failure', password: 'hidden' },
      {
        code: 'UNKNOWN_FAILURE',
        category: 'unknown',
        message: 'The SDK operation failed.',
      },
    );

    expect(transaction.category).toBe('transaction');
    expect(unknown.category).toBe('unknown');
    expect(JSON.stringify(unknown)).toBe(
      JSON.stringify({
        name: 'AegisSdkError',
        code: 'UNKNOWN_FAILURE',
        category: 'unknown',
        message: 'The SDK operation failed.',
        metadata: {},
      }),
    );
  });
});
