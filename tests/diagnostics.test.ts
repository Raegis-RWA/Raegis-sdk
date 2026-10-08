import { Keypair, Networks } from '@stellar/stellar-sdk';
import { AegisClient } from '../src/client';
import { createReadOnlyClient, createInvestorClient } from '../src/client-factory';
import {
  diagnoseConfig,
  buildRuntimeDiagnostics,
  classifyComplianceFailure,
  buildDiagnosticsReport,
} from '../src';
import { PortfolioError } from '../src/errors/portfolio';
import { RoleError } from '../src/errors/role';
import { ConfigValidationError } from '../src/errors/config';

const mockContractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const KNOWN_SECRET = Keypair.random().secret();
const KNOWN_PUBLIC = Keypair.random().publicKey();

describe('diagnoseConfig', () => {
  it('never includes a known secret key, whole or partial, in the serialized report', () => {
    const report = diagnoseConfig({
      contractId: mockContractId,
      environment: 'testnet',
      keypair: Keypair.fromSecret(KNOWN_SECRET),
    });

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(KNOWN_SECRET);
    expect(serialized).not.toContain(KNOWN_SECRET.slice(0, 10));
    expect(report.signerConfigured).toBe(true);
  });

  it('does not include an unknown, unlisted sensitive field the reporter has never heard of', () => {
    const report = diagnoseConfig({
      contractId: mockContractId,
      environment: 'testnet',
      // A field the reporter's allowlist has no knowledge of. If the reporter
      // ever changed to a denylist / spread-then-strip approach, this would leak.
      seedPhrase: 'legs galaxy inner rival fossil chalk energy nose demand oyster clip fatal',
      apiSecret: 'sk-live-totally-secret-value',
    } as unknown as Record<string, unknown>);

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('legs galaxy');
    expect(serialized).not.toContain('sk-live-totally-secret-value');
    expect(Object.keys(report)).toEqual([
      'contractId',
      'environment',
      'rpcUrl',
      'networkPassphrase',
      'signerConfigured',
      'status',
    ]);
  });

  it('redacts credentials carried in an RPC URL query string, keeping only origin and path', () => {
    const report = diagnoseConfig({
      contractId: mockContractId,
      rpcUrl: 'https://rpc.example.com:8443/soroban/rpc?apiKey=super-secret-token',
      networkPassphrase: Networks.TESTNET,
    });

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('super-secret-token');
    expect(serialized).not.toContain('apiKey');
    expect(report.rpcUrl).toEqual({
      present: true,
      origin: 'https://rpc.example.com:8443',
      path: '/soroban/rpc',
    });
  });

  it('reports incomplete/invalid config as a status, without throwing', () => {
    expect(() => diagnoseConfig({ environment: 'devnet' })).not.toThrow();
    expect(() => diagnoseConfig(undefined)).not.toThrow();
    expect(() => diagnoseConfig(null)).not.toThrow();
    expect(() => diagnoseConfig('not an object')).not.toThrow();

    const missingContractId = diagnoseConfig({ environment: 'testnet' });
    expect(missingContractId.status).toBe('invalid');
    expect(missingContractId.errorCode).toBe('MISSING_CONFIG');
    expect(missingContractId.contractId).toEqual({ present: false });

    const empty = diagnoseConfig(undefined);
    expect(empty.status).toBe('invalid');
    expect(empty.environment).toEqual({ name: 'unset' });
    expect(empty.rpcUrl).toEqual({ present: false });
  });

  it('reports an unsupported network name as a distinct state rather than "unset"', () => {
    const report = diagnoseConfig({ contractId: mockContractId, environment: 'devnet' });

    expect(report.status).toBe('invalid');
    expect(report.errorCode).toBe('MISSING_CONFIG');
    expect(report.environment).toEqual({ name: 'unsupported' });
  });

  it('reports the mainnet preset as unavailable when allowMainnet is not set', () => {
    const report = diagnoseConfig({ contractId: mockContractId, environment: 'mainnet' });

    expect(report.status).toBe('invalid');
    expect(report.errorCode).toBe('ENVIRONMENT_UNAVAILABLE');
    expect(report.environment).toEqual({ name: 'mainnet' });
  });

  it('reports a valid resolved config as ok, including preset-derived rpcUrl', () => {
    const report = diagnoseConfig({ contractId: mockContractId, environment: 'testnet' });

    expect(report.status).toBe('ok');
    expect(report.errorCode).toBeUndefined();
    expect(report.contractId).toEqual({ present: true });
    expect(report.environment).toEqual({ name: 'testnet' });
    expect(report.rpcUrl.present).toBe(true);
    expect(report.rpcUrl.origin).toBe('https://soroban-testnet.stellar.org');
  });
});

describe('buildRuntimeDiagnostics', () => {
  const makeClient = (keypair?: Keypair) =>
    new AegisClient({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: Networks.TESTNET,
      contractId: mockContractId,
      keypair,
    });

  it('reports reachable RPC, signer presence, and declared role', async () => {
    const client = makeClient(Keypair.fromSecret(KNOWN_SECRET));
    jest.spyOn(client.rpcServer, 'getHealth').mockResolvedValue({ status: 'healthy' } as any);

    const runtime = await buildRuntimeDiagnostics(client, { role: 'investor' });

    expect(runtime.rpcReachability).toBe('reachable');
    expect(runtime.signerConfigured).toBe(true);
    expect(runtime.role).toBe('investor');
    expect(JSON.stringify(runtime)).not.toContain(KNOWN_SECRET);
  });

  it('reports unreachable RPC via the existing redacted network-failure diagnostic', async () => {
    const client = makeClient();
    jest
      .spyOn(client.rpcServer, 'getHealth')
      .mockRejectedValue(
        Object.assign(new Error('connect ECONNREFUSED, auth=secret-token'), {
          code: 'ECONNREFUSED',
        }),
      );

    const runtime = await buildRuntimeDiagnostics(client);

    expect(runtime.rpcReachability).toBe('unreachable');
    expect(runtime.rpcFailure?.code).toBe('RPC_UNAVAILABLE');
    expect(JSON.stringify(runtime)).not.toContain('secret-token');
    expect(runtime.role).toBe('unspecified');
    expect(runtime.signerConfigured).toBe(false);
  });
});

describe('classifyComplianceFailure', () => {
  it('classifies a PortfolioError compliance failure by code, without message/cause text', () => {
    const error = new PortfolioError(
      `Compliance status query failed for ${KNOWN_PUBLIC}: private upstream detail`,
      'COMPLIANCE_ERROR',
    );

    const classification = classifyComplianceFailure(error);

    expect(classification).toEqual({
      domain: 'portfolio',
      code: 'COMPLIANCE_ERROR',
      classified: true,
    });
    expect(JSON.stringify(classification)).not.toContain(KNOWN_PUBLIC);
    expect(JSON.stringify(classification)).not.toContain('private upstream detail');
  });

  it('classifies a RoleError compliance failure', () => {
    const classification = classifyComplianceFailure(
      new RoleError('Compliance status query failed', 'COMPLIANCE_ERROR'),
    );

    expect(classification).toEqual({ domain: 'role', code: 'COMPLIANCE_ERROR', classified: true });
  });

  it('classifies a config validation failure', () => {
    const classification = classifyComplianceFailure(
      new ConfigValidationError('bad config', 'INVALID_RPC_URL'),
    );

    expect(classification).toEqual({ domain: 'config', code: 'INVALID_RPC_URL', classified: true });
  });

  it('marks unrecognized errors as unclassified rather than guessing from message text', () => {
    const classification = classifyComplianceFailure(new Error(`identity leak ${KNOWN_PUBLIC}`));

    expect(classification).toEqual({ domain: 'unknown', code: 'UNKNOWN', classified: false });
    expect(JSON.stringify(classification)).not.toContain(KNOWN_PUBLIC);
  });
});

describe('buildDiagnosticsReport', () => {
  it('combines config, runtime, and compliance sections with no secret material anywhere', async () => {
    const keypair = Keypair.fromSecret(KNOWN_SECRET);
    const client = createReadOnlyClient({
      contractId: mockContractId,
      environment: 'testnet',
    });
    jest
      .spyOn(client.client.rpcServer, 'getHealth')
      .mockResolvedValue({ status: 'healthy' } as any);

    const report = await buildDiagnosticsReport({
      config: { contractId: mockContractId, environment: 'testnet', keypair },
      client,
      complianceError: new PortfolioError('failed', 'COMPLIANCE_ERROR'),
    });

    expect(report.config.status).toBe('ok');
    expect(report.runtime.rpcReachability).toBe('reachable');
    expect(report.runtime.role).toBe('read-only');
    expect(report.complianceFailure).toEqual({
      domain: 'portfolio',
      code: 'COMPLIANCE_ERROR',
      classified: true,
    });
    expect(JSON.stringify(report)).not.toContain(KNOWN_SECRET);
  });

  it('reads the declared role from an investor (signer-capable) role-aware client', async () => {
    const keypair = Keypair.fromSecret(KNOWN_SECRET);
    const client = createInvestorClient({
      contractId: mockContractId,
      environment: 'testnet',
      keypair,
    });
    jest
      .spyOn(client.client.rpcServer, 'getHealth')
      .mockResolvedValue({ status: 'healthy' } as any);

    const report = await buildDiagnosticsReport({ client });

    expect(report.runtime.role).toBe('investor');
    expect(report.runtime.signerConfigured).toBe(true);
    expect(JSON.stringify(report)).not.toContain(KNOWN_SECRET);
  });

  it('produces an unprobed runtime section when no client is given, without throwing', async () => {
    const report = await buildDiagnosticsReport({ config: { environment: 'testnet' } });

    expect(report.runtime).toEqual({
      rpcReachability: 'unknown',
      role: 'unspecified',
      signerConfigured: false,
    });
    expect(report.config.status).toBe('invalid');
    expect(report.config.errorCode).toBe('MISSING_CONFIG');
  });
});
