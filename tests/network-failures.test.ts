import { Networks } from '@stellar/stellar-sdk';
import {
  AegisClient,
  NetworkFailure,
  buildNetworkFailureDiagnostic,
  classifyNetworkFailure,
} from '../src';

describe('Network failure classification', () => {
  it('classifies timeouts without copying raw messages', () => {
    const failure = classifyNetworkFailure({
      code: 'ETIMEDOUT',
      message: 'Request to https://rpc.example/?token=secret-value timed out',
    });

    expect(failure).toBeInstanceOf(NetworkFailure);
    expect(failure.code).toBe('TIMEOUT');
    expect(failure.retryable).toBe(true);
    expect(failure.message).toBe('The network request timed out.');
    expect(failure.message).not.toContain('secret-value');
    expect(JSON.stringify(failure)).not.toContain('secret-value');
  });

  it.each([
    [
      { statusCode: 503, message: 'private upstream payload' },
      'RPC_UNAVAILABLE',
      true,
    ],
    [
      { message: 'Network passphrase mismatch: private value' },
      'INVALID_NETWORK_PASSPHRASE',
      false,
    ],
    [
      new SyntaxError('Unexpected token in private JSON payload'),
      'MALFORMED_RESPONSE',
      false,
    ],
    [{ message: 'unfamiliar private failure' }, 'UNKNOWN', false],
  ] as const)(
    'maps representative errors to %s',
    (input, expectedCode, expectedRetryable) => {
      const failure = classifyNetworkFailure(input);

      expect(failure.code).toBe(expectedCode);
      expect(failure.retryable).toBe(expectedRetryable);
      expect(failure.message).not.toContain('private');
    },
  );

  it('preserves a safe retry-after value for rate limits', () => {
    const diagnostic = buildNetworkFailureDiagnostic({
      response: { status: 429 },
      retryAfterSeconds: '2.2',
      message: 'Too many requests; authorization=private',
    });

    expect(diagnostic).toEqual({
      code: 'RATE_LIMITED',
      message: 'The Stellar RPC service is rate limiting requests.',
      retryable: true,
      action: 'retry-with-backoff',
      retryAfterSeconds: 3,
    });
  });

  it('does not serialize raw causes in support diagnostics', () => {
    const diagnostic = buildNetworkFailureDiagnostic({
      code: 'ECONNREFUSED',
      message: 'Bearer secret-token',
      headers: { authorization: 'secret-token' },
    });

    expect(diagnostic.code).toBe('RPC_UNAVAILABLE');
    expect(JSON.stringify(diagnostic)).not.toContain('secret-token');
    expect(Object.keys(diagnostic)).toEqual([
      'code',
      'message',
      'retryable',
      'action',
    ]);
  });
});

describe('AegisClient network boundary', () => {
  const client = new AegisClient({
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: Networks.TESTNET,
    contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
  });

  it('turns rejected RPC operations into typed failures', async () => {
    await expect(
      client.runNetworkOperation(async () => {
        throw Object.assign(new Error('upstream URL contains secret'), {
          code: 'ECONNRESET',
        });
      }),
    ).rejects.toMatchObject({
      name: 'NetworkFailure',
      code: 'RPC_UNAVAILABLE',
      retryable: true,
      message: 'The Stellar RPC service is temporarily unavailable.',
    });
  });

  it('returns successful operation values unchanged', async () => {
    await expect(
      client.runNetworkOperation(async () => ({ ledger: 123 })),
    ).resolves.toEqual({ ledger: 123 });
  });

  it('exposes safe diagnostics through the client', () => {
    expect(
      client.diagnoseNetworkFailure({
        message: 'Invalid network passphrase: secret value',
      }),
    ).toEqual({
      code: 'INVALID_NETWORK_PASSPHRASE',
      message: 'The configured network does not match the target transaction.',
      retryable: false,
      action: 'check-configuration',
    });
  });
});
