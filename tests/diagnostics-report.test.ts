import { Networks } from '@stellar/stellar-sdk';
import {
  AegisClient,
  ConfigValidationError,
  NetworkFailure,
} from '../src';

const CONTRACT_ID = 'C_DIAGNOSTICS_MARKER_MUST_NOT_BE_SERIALIZED';

describe('Aegis SDK diagnostics report', () => {
  it('reports configuration readiness without serializing sensitive config values', () => {
    const client = new AegisClient({
      rpcUrl: 'https://rpc.example.com/private/path?opaque=marker-alpha',
      networkPassphrase: 'private network marker beta',
      contractId: CONTRACT_ID,
    });

    const report = client.buildDiagnosticsReport();
    const serialized = JSON.stringify(report);

    expect(report).toMatchObject({
      schemaVersion: 1,
      safeToShare: true,
      configuration: {
        environment: 'custom',
        rpc: {
          configured: true,
          transport: 'https',
          usesPresetEndpoint: false,
        },
        network: {
          configured: true,
          target: 'custom',
        },
        contract: {
          configured: true,
        },
        signerConfigured: false,
      },
      network: {
        target: 'custom',
        status: 'not-checked',
      },
      compliance: {
        module: 'available',
        protocolState: 'not-checked',
        legalStatus: 'not-assessed',
      },
      recentErrors: [],
    });

    expect(serialized).not.toContain('marker-alpha');
    expect(serialized).not.toContain('marker beta');
    expect(serialized).not.toContain(CONTRACT_ID);
  });

  it('identifies a preset without claiming live network or compliance status', () => {
    const client = new AegisClient({
      environment: 'testnet',
      contractId: CONTRACT_ID,
    });

    const report = client.buildDiagnosticsReport();

    expect(report.configuration.environment).toBe('testnet');
    expect(report.configuration.network.target).toBe('testnet');
    expect(report.configuration.rpc.usesPresetEndpoint).toBe(true);
    expect(report.network).toEqual({
      target: 'testnet',
      status: 'not-checked',
    });
    expect(report.compliance.protocolState).toBe('not-checked');
    expect(report.compliance.legalStatus).toBe('not-assessed');
    expect(client.networkPassphrase).toBe(Networks.TESTNET);
  });

  it('redacts network, configuration, and unknown recent errors', () => {
    const client = new AegisClient({
      environment: 'testnet',
      contractId: CONTRACT_ID,
    });
    const report = client.buildDiagnosticsReport({
      recentErrors: [
        new NetworkFailure('opaque marker-delta', 'RATE_LIMITED', true, {
          retryAfterSeconds: 2,
          cause: { detail: 'marker-epsilon' },
        }),
        new ConfigValidationError(
          'Bad RPC marker-zeta',
          'INVALID_RPC_URL',
        ),
        new Error('marker-eta'),
      ],
    });

    expect(report.network).toEqual({
      target: 'testnet',
      status: 'degraded',
      recentFailure: {
        code: 'RATE_LIMITED',
        message: 'The Stellar RPC service is rate limiting requests.',
        retryable: true,
        action: 'retry-with-backoff',
        retryAfterSeconds: 2,
      },
    });
    expect(report.recentErrors).toEqual([
      {
        category: 'network',
        code: 'RATE_LIMITED',
        message: 'The Stellar RPC service is rate limiting requests.',
        retryable: true,
        action: 'retry-with-backoff',
        retryAfterSeconds: 2,
      },
      {
        category: 'configuration',
        code: 'INVALID_RPC_URL',
        message: 'The SDK RPC endpoint configuration is invalid.',
      },
      {
        category: 'unknown',
        code: 'UNKNOWN',
        message:
          'An SDK operation failed. Raw error details are intentionally omitted.',
      },
    ]);

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('marker-delta');
    expect(serialized).not.toContain('marker-epsilon');
    expect(serialized).not.toContain('marker-zeta');
    expect(serialized).not.toContain('marker-eta');
  });

  it('retains only the five most recent errors', () => {
    const client = new AegisClient({
      environment: 'testnet',
      contractId: CONTRACT_ID,
    });

    const report = client.buildDiagnosticsReport({
      recentErrors: Array.from(
        { length: 7 },
        (_, index) => new Error(`marker-${index}`),
      ),
    });

    expect(report.recentErrors).toHaveLength(5);
    expect(JSON.stringify(report)).not.toContain('marker-');
  });
});
