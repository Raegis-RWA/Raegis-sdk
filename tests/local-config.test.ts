import { Keypair, Networks } from '@stellar/stellar-sdk';
import {
  LOCAL_DEV_DEFAULTS,
  LOCAL_ENV_KEYS,
  LocalConfigError,
  checkLocalNetwork,
  createLocalClient,
  inspectLocalRpcUrl,
  isAllowedLocalDevHostname,
  isLoopbackHostname,
  resolveLocalConfig,
  toAegisClientConfig,
} from '../src';
import {
  LOCAL_FIXTURE_CONTRACT_ID,
  LOCAL_FIXTURE_RPC_URL,
  localEnvDockerHost,
  localEnvMalformedUrl,
  localEnvMissingContract,
  localEnvNonLoopback,
  localEnvValid,
  localEnvWhitespace,
} from './fixtures/local-config';

describe('local hostname helpers', () => {
  it.each([
    ['localhost', true],
    ['127.0.0.1', true],
    ['127.1.2.3', true],
    ['::1', true],
    ['[::1]', true],
    ['0.0.0.0', true],
    ['host.docker.internal', false],
    ['rpc.example.com', false],
  ])('isLoopbackHostname(%s) => %s', (host, expected) => {
    expect(isLoopbackHostname(host)).toBe(expected);
  });

  it('treats host.docker.internal as an allowed local-dev host', () => {
    expect(isAllowedLocalDevHostname('host.docker.internal')).toBe(true);
    expect(isAllowedLocalDevHostname('rpc.example.com')).toBe(false);
  });
});

describe('resolveLocalConfig', () => {
  it('resolves defaults when only a contract ID is provided', () => {
    const resolved = resolveLocalConfig({
      contractId: LOCAL_FIXTURE_CONTRACT_ID,
    });

    expect(resolved).toMatchObject({
      environment: 'local',
      rpcUrl: LOCAL_DEV_DEFAULTS.rpcUrl,
      networkPassphrase: Networks.STANDALONE,
      contractId: LOCAL_FIXTURE_CONTRACT_ID,
      horizonUrl: LOCAL_DEV_DEFAULTS.horizonUrl,
      friendbotUrl: LOCAL_DEV_DEFAULTS.friendbotUrl,
      loopback: true,
      localDevHost: true,
    });
    expect(resolved.keypair).toBeUndefined();
  });

  it('prefers explicit options over env over defaults', () => {
    const resolved = resolveLocalConfig({
      contractId: LOCAL_FIXTURE_CONTRACT_ID,
      rpcUrl: 'http://127.0.0.1:9000/soroban/rpc',
      friendbotUrl: 'http://127.0.0.1:9000/friendbot',
      env: {
        ...localEnvValid,
        AEGIS_LOCAL_RPC_URL: 'http://localhost:8000/soroban/rpc',
      },
    });

    expect(resolved.rpcUrl).toBe('http://127.0.0.1:9000/soroban/rpc');
    expect(resolved.friendbotUrl).toBe('http://127.0.0.1:9000/friendbot');
    expect(resolved.networkPassphrase).toBe(Networks.STANDALONE);
  });

  it('loads configuration from an injected env record', () => {
    const resolved = resolveLocalConfig({ env: localEnvValid });

    expect(resolved.contractId).toBe(LOCAL_FIXTURE_CONTRACT_ID);
    expect(resolved.rpcUrl).toBe(LOCAL_FIXTURE_RPC_URL);
    expect(Object.keys(LOCAL_ENV_KEYS)).toEqual(
      expect.arrayContaining([
        'rpcUrl',
        'networkPassphrase',
        'contractId',
        'horizonUrl',
        'friendbotUrl',
        'secretKey',
      ]),
    );
  });

  it('treats whitespace-only env values as unset', () => {
    expect(() =>
      resolveLocalConfig({ env: localEnvWhitespace }),
    ).toThrow(LocalConfigError);

    try {
      resolveLocalConfig({ env: localEnvWhitespace });
    } catch (error) {
      expect(error).toBeInstanceOf(LocalConfigError);
      expect((error as LocalConfigError).code).toBe('MISSING_CONTRACT_ID');
    }
  });

  it('requires a contract ID with an actionable hint', () => {
    try {
      resolveLocalConfig({ env: localEnvMissingContract });
      throw new Error('expected LocalConfigError');
    } catch (error) {
      expect(error).toBeInstanceOf(LocalConfigError);
      expect((error as LocalConfigError).code).toBe('MISSING_CONTRACT_ID');
      expect((error as LocalConfigError).hint).toMatch(/AEGIS_CONTRACT_ID/);
    }
  });

  it('rejects invalid contract ID placeholders', () => {
    try {
      resolveLocalConfig({ contractId: 'C...' });
      throw new Error('expected LocalConfigError');
    } catch (error) {
      expect(error).toBeInstanceOf(LocalConfigError);
      expect((error as LocalConfigError).code).toBe('INVALID_CONTRACT_ID');
      expect((error as Error).message).not.toContain('C_YOUR');
    }
  });

  it('rejects non-loopback http RPC URLs by default', () => {
    try {
      resolveLocalConfig({ env: localEnvNonLoopback });
      throw new Error('expected LocalConfigError');
    } catch (error) {
      expect(error).toBeInstanceOf(LocalConfigError);
      expect((error as LocalConfigError).code).toBe('NON_LOOPBACK_RPC_URL');
      expect((error as Error).message).not.toContain('password');
    }
  });

  it('allows non-loopback http when explicitly opted in', () => {
    const resolved = resolveLocalConfig({
      env: localEnvNonLoopback,
      allowNonLoopbackRpc: true,
    });

    expect(resolved.rpcUrl).toBe('http://rpc.example.com/soroban/rpc');
    expect(resolved.localDevHost).toBe(false);
    expect(resolved.loopback).toBe(false);
  });

  it('allows host.docker.internal without opt-in', () => {
    const resolved = resolveLocalConfig({ env: localEnvDockerHost });
    expect(resolved.localDevHost).toBe(true);
    expect(resolved.loopback).toBe(false);
  });

  it('rejects malformed RPC URLs without echoing junk input', () => {
    try {
      resolveLocalConfig({ env: localEnvMalformedUrl });
      throw new Error('expected LocalConfigError');
    } catch (error) {
      expect(error).toBeInstanceOf(LocalConfigError);
      expect((error as LocalConfigError).code).toBe('INVALID_RPC_URL');
      expect((error as Error).message).toContain('<invalid-url>');
      expect((error as Error).message).not.toContain('not-a-url');
    }
  });

  it('loads a secret key into a Keypair without returning the secret', () => {
    const keypair = Keypair.random();
    const resolved = resolveLocalConfig({
      contractId: LOCAL_FIXTURE_CONTRACT_ID,
      secretKey: keypair.secret(),
    });

    expect(resolved.keypair?.publicKey()).toBe(keypair.publicKey());
    expect(JSON.stringify(resolved)).not.toContain(keypair.secret());
    expect(resolved).not.toHaveProperty('secretKey');
  });

  it('rejects invalid secret keys without echoing them', () => {
    const bad = 'S_NOT_A_REAL_SECRET_VALUE_LEAK_CHECK';
    try {
      resolveLocalConfig({
        contractId: LOCAL_FIXTURE_CONTRACT_ID,
        secretKey: bad,
      });
      throw new Error('expected LocalConfigError');
    } catch (error) {
      expect(error).toBeInstanceOf(LocalConfigError);
      expect((error as LocalConfigError).code).toBe('INVALID_SECRET_KEY');
      expect((error as Error).message).not.toContain(bad);
      expect(JSON.stringify(error)).not.toContain(bad);
    }
  });

  it('maps to AegisClientConfig for environment: local', () => {
    const resolved = resolveLocalConfig({
      contractId: LOCAL_FIXTURE_CONTRACT_ID,
    });
    expect(toAegisClientConfig(resolved)).toEqual({
      environment: 'local',
      rpcUrl: resolved.rpcUrl,
      networkPassphrase: resolved.networkPassphrase,
      contractId: resolved.contractId,
    });
  });
});

describe('createLocalClient', () => {
  it('constructs an AegisClient against the local preset', () => {
    const client = createLocalClient({
      contractId: LOCAL_FIXTURE_CONTRACT_ID,
    });

    expect(client.contractId).toBe(LOCAL_FIXTURE_CONTRACT_ID);
    expect(client.networkPassphrase).toBe(Networks.STANDALONE);
    expect(client.compliance).toBeDefined();
  });
});

describe('inspectLocalRpcUrl', () => {
  it('redacts credentials from the display form', () => {
    const inspection = inspectLocalRpcUrl(
      'http://user:secret@localhost:8000/soroban/rpc',
    );
    expect(inspection.display).toBe(
      'http://<redacted>@localhost:8000/soroban/rpc',
    );
    expect(inspection.display).not.toContain('secret');
    expect(inspection.loopback).toBe(true);
  });
});

describe('checkLocalNetwork', () => {
  it('reports unavailable with a start-network hint when RPC refuses connections', async () => {
    const health = await checkLocalNetwork({
      contractId: LOCAL_FIXTURE_CONTRACT_ID,
      // High unused port — connection should be refused quickly.
      rpcUrl: 'http://127.0.0.1:59999/soroban/rpc',
    });

    expect(health.status).toBe('unavailable');
    expect(health.retryable).toBe(false);
    expect(health.hint).toMatch(/local:up|docker compose/i);
    expect(health.rpcDisplay).toContain('127.0.0.1:59999');
    expect(JSON.stringify(health)).not.toContain('ECONNREFUSED');
  });

  it('accepts a constructed local client', async () => {
    const client = createLocalClient({
      contractId: LOCAL_FIXTURE_CONTRACT_ID,
      rpcUrl: 'http://127.0.0.1:59998/soroban/rpc',
    });

    const health = await checkLocalNetwork(client);
    expect(health.status).toBe('unavailable');
    expect(health.message).toMatch(/not reachable/i);
  });
});
