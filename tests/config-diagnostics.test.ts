import { Keypair, Networks } from '@stellar/stellar-sdk';
import {
  AegisClient,
  buildConfigDiagnostic,
  ConfigValidationError,
  redactContractId,
  redactRpcUrl,
} from '../src';

const MOCK_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const MASKED_CONTRACT_ID = 'CAAA...BSC4';

const DIAGNOSTIC_ROOT_KEYS = [
  'status',
  'ready',
  'environment',
  'rpc',
  'contractId',
  'network',
  'featureFlags',
  'signer',
  'issues',
] as const;

describe('RPC URL redaction', () => {
  it('strips credentials, path, query, and fragment', () => {
    expect(
      redactRpcUrl(
        'https://user:super-secret@rpc.example.com/v1/api-key-abc?token=leak#frag',
      ),
    ).toBe('https://<redacted>@rpc.example.com/<redacted>?<redacted>#<redacted>');
  });

  it('never echoes malformed input', () => {
    expect(redactRpcUrl('not-a-url-with-secret-token')).toBe('<invalid-url>');
    expect(redactRpcUrl('')).toBe('<missing>');
  });
});

describe('Contract ID redaction', () => {
  it('masks valid contract IDs', () => {
    expect(redactContractId(MOCK_CONTRACT_ID)).toBe(MASKED_CONTRACT_ID);
  });

  it('does not echo invalid placeholders', () => {
    expect(redactContractId('C...')).toBe('<invalid-contract-id>');
    expect(redactContractId('C_YOUR_CONTRACT_ID')).toBe('<invalid-contract-id>');
  });
});

describe('buildConfigDiagnostic', () => {
  it('reports a healthy testnet configuration', () => {
    const diagnostic = buildConfigDiagnostic({
      environment: 'testnet',
      contractId: MOCK_CONTRACT_ID,
    });

    expect(diagnostic.status).toBe('ok');
    expect(diagnostic.ready).toBe(true);
    expect(diagnostic.environment).toBe('testnet');
    expect(diagnostic.network).toBe('testnet');
    expect(diagnostic.contractId).toBe(MASKED_CONTRACT_ID);
    expect(diagnostic.rpc.display).toBe('https://soroban-testnet.stellar.org');
    expect(diagnostic.rpc.secure).toBe(true);
    expect(diagnostic.featureFlags).toEqual({
      allowMainnet: false,
      environmentAvailable: true,
    });
    expect(diagnostic.signer).toEqual({ present: false, type: 'none' });
    expect(diagnostic.issues).toEqual([]);
    expect(Object.keys(diagnostic)).toEqual([...DIAGNOSTIC_ROOT_KEYS]);
  });

  it('represents signer presence without secrets', () => {
    const keypair = Keypair.random();
    const secret = keypair.secret();

    const diagnostic = buildConfigDiagnostic({
      environment: 'testnet',
      contractId: MOCK_CONTRACT_ID,
      keypair,
    });

    expect(diagnostic.signer).toEqual({ present: true, type: 'keypair' });
    expect(diagnostic.signer).not.toHaveProperty('secret');
    expect(diagnostic.signer).not.toHaveProperty('publicKey');
    expect(JSON.stringify(diagnostic)).not.toContain(secret);
    expect(JSON.stringify(diagnostic)).not.toContain('_secretSeed');
    expect(JSON.stringify(diagnostic)).not.toContain('_secretKey');
  });

  it('redacts credential-bearing RPC URLs in diagnostics', () => {
    const secretUrl =
      'https://user:password-leak@custom-rpc.example.com/path/key?token=abc123';

    const diagnostic = buildConfigDiagnostic({
      environment: 'testnet',
      contractId: MOCK_CONTRACT_ID,
      rpcUrl: secretUrl,
    });

    const serialized = JSON.stringify(diagnostic);
    expect(serialized).not.toContain('password-leak');
    expect(serialized).not.toContain('abc123');
    expect(serialized).not.toContain('user:password');
    expect(diagnostic.rpc.display).toBe(
      'https://<redacted>@custom-rpc.example.com/<redacted>?<redacted>',
    );
    expect(diagnostic.rpc.hasCredentials).toBe(true);
    expect(diagnostic.rpc.hasSensitiveSegments).toBe(true);
    expect(diagnostic.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'RPC_URL_HAS_CREDENTIALS',
        'RPC_URL_HAS_SENSITIVE_SEGMENTS',
      ]),
    );
  });

  it('produces typed diagnostics for invalid contract IDs', () => {
    const diagnostic = buildConfigDiagnostic({
      environment: 'testnet',
      contractId: 'C...',
    });

    expect(diagnostic.status).toBe('error');
    expect(diagnostic.ready).toBe(false);
    expect(diagnostic.contractId).toBe('<invalid-contract-id>');
    expect(diagnostic.issues).toEqual([
      {
        code: 'INVALID_CONTRACT_ID',
        field: 'contractId',
        severity: 'error',
        message:
          'The contract ID is not a valid StrKey-encoded Soroban contract ID.',
      },
    ]);
  });

  it('produces typed diagnostics for gated mainnet without opt-in', () => {
    const diagnostic = buildConfigDiagnostic({
      environment: 'mainnet',
      contractId: MOCK_CONTRACT_ID,
    });

    expect(diagnostic.status).toBe('error');
    expect(diagnostic.ready).toBe(false);
    expect(diagnostic.featureFlags).toEqual({
      allowMainnet: false,
      environmentAvailable: false,
    });
    expect(diagnostic.issues).toContainEqual({
      code: 'ENVIRONMENT_UNAVAILABLE',
      field: 'environment',
      severity: 'error',
      message:
        'The selected environment is gated and was not explicitly opted into.',
    });
  });

  it('marks ready when mainnet is explicitly opted into', () => {
    const diagnostic = buildConfigDiagnostic({
      environment: 'mainnet',
      allowMainnet: true,
      contractId: MOCK_CONTRACT_ID,
    });

    expect(diagnostic.ready).toBe(true);
    expect(diagnostic.featureFlags.allowMainnet).toBe(true);
    expect(diagnostic.issues).toEqual([]);
  });

  it('rejects truthy non-boolean allowMainnet as an opt-in', () => {
    const diagnostic = buildConfigDiagnostic({
      environment: 'mainnet',
      // @ts-expect-error intentional runtime misuse
      allowMainnet: 'yes',
      contractId: MOCK_CONTRACT_ID,
    });

    expect(diagnostic.ready).toBe(false);
    expect(diagnostic.featureFlags.allowMainnet).toBe(false);
  });

  it('collects multiple independent issues without fail-fast', () => {
    const diagnostic = buildConfigDiagnostic({
      environment: 'mainnet',
      contractId: 'not-a-contract',
      rpcUrl: 'not-a-url',
      networkPassphrase: '   ',
    });

    const codes = diagnostic.issues.map((issue) => issue.code).sort();
    expect(codes).toEqual(
      [
        'ENVIRONMENT_UNAVAILABLE',
        'INVALID_CONTRACT_ID',
        'INVALID_NETWORK_PASSPHRASE',
        'INVALID_RPC_URL',
      ].sort(),
    );
  });

  it('handles null and empty input safely', () => {
    const diagnostic = buildConfigDiagnostic(null);

    expect(diagnostic.status).toBe('error');
    expect(diagnostic.ready).toBe(false);
    expect(Object.keys(diagnostic)).toEqual([...DIAGNOSTIC_ROOT_KEYS]);
    expect(diagnostic.featureFlags.environmentAvailable).toBeNull();
    expect(diagnostic.issues[0]?.code).toBe('MISSING_CONFIG');
  });

  it('never embeds raw Keypair fields when serialised', () => {
    const keypair = Keypair.random();
    const diagnostic = buildConfigDiagnostic({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: Networks.TESTNET,
      contractId: MOCK_CONTRACT_ID,
      keypair,
    });

    const serialized = JSON.stringify(diagnostic);
    for (const fragment of [
      keypair.secret(),
      '_secretSeed',
      '_secretKey',
      '_publicKey',
      'ed25519',
    ]) {
      expect(serialized).not.toContain(fragment);
    }
  });
});

describe('Config validation hardening', () => {
  it('rejects invalid contract IDs with INVALID_CONTRACT_ID', () => {
    expect(() => {
      new AegisClient({
        environment: 'testnet',
        contractId: 'C...',
      });
    }).toThrow(ConfigValidationError);

    try {
      new AegisClient({
        environment: 'testnet',
        contractId: 'C...',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as ConfigValidationError).code).toBe('INVALID_CONTRACT_ID');
      expect((error as ConfigValidationError).message).not.toContain('C...');
    }
  });

  it('does not echo credential-bearing URLs in validation errors', () => {
    const secretUrl = 'https://user:password-leak@rpc.example.com/?token=abc';

    try {
      new AegisClient({
        environment: 'testnet',
        contractId: MOCK_CONTRACT_ID,
        rpcUrl: 'not a url with password-leak token',
      });
      throw new Error('expected ConfigValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as ConfigValidationError).code).toBe('INVALID_RPC_URL');
      expect((error as Error).message).not.toContain('password-leak');
      expect((error as Error).message).toContain('<invalid-url>');
    }

    try {
      new AegisClient({
        environment: 'testnet',
        contractId: MOCK_CONTRACT_ID,
        rpcUrl: secretUrl.replace('https', 'ftp'),
      });
      throw new Error('expected ConfigValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as Error).message).not.toContain('password-leak');
      expect((error as Error).message).toContain('<redacted>');
    }
  });

  it('requires allowMainnet === true, not a truthy string', () => {
    expect(() => {
      new AegisClient({
        environment: 'mainnet',
        contractId: MOCK_CONTRACT_ID,
        // @ts-expect-error intentional runtime misuse
        allowMainnet: 'yes',
      });
    }).toThrow(ConfigValidationError);
  });
});

describe('AegisClient.diagnoseConfiguration', () => {
  it('returns the frozen construction-time diagnostic', () => {
    const keypair = Keypair.random();
    const client = new AegisClient({
      environment: 'local',
      contractId: MOCK_CONTRACT_ID,
      keypair,
    });

    const diagnostic = client.diagnoseConfiguration();
    expect(diagnostic.environment).toBe('local');
    expect(diagnostic.network).toBe('standalone');
    expect(diagnostic.signer.present).toBe(true);
    expect(diagnostic.rpc.loopback).toBe(true);
    expect(Object.isFrozen(diagnostic)).toBe(true);
    expect(JSON.stringify(diagnostic)).not.toContain(keypair.secret());
  });
});
