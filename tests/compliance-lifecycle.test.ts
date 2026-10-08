import { Keypair, Networks } from '@stellar/stellar-sdk';
import {
  AegisClient,
  ComplianceLifecycleError,
} from '../src';

const BASE_CONFIG = {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
  contractId: 'C_COMPLIANCE_LIFECYCLE_TEST',
};

function makeClient(keypair?: Keypair): AegisClient {
  return new AegisClient({
    ...BASE_CONFIG,
    ...(keypair ? { keypair } : {}),
  });
}

describe('Compliance lifecycle', () => {
  it('rejects invalid Stellar addresses with a typed error before RPC work', async () => {
    const client = makeClient();

    await expect(
      client.compliance.checkWhitelist('not-a-stellar-address'),
    ).rejects.toMatchObject({
      name: 'ComplianceLifecycleError',
      code: 'INVALID_ADDRESS',
      operation: 'read',
    });
  });

  it('returns an approved status for a confirmed whitelist read', async () => {
    const client = makeClient();
    const address = Keypair.random().publicKey();
    jest
      .spyOn(client.compliance as any, 'readWhitelist')
      .mockResolvedValue(true);

    await expect(
      client.compliance.getComplianceStatus(address),
    ).resolves.toMatchObject({
      address,
      status: 'approved',
      code: 'WHITELIST_APPROVED',
      eligible: true,
    });
  });

  it('distinguishes a confirmed negative read from an unavailable read', async () => {
    const client = makeClient();
    const address = Keypair.random().publicKey();
    const read = jest.spyOn(client.compliance as any, 'readWhitelist');

    read.mockResolvedValueOnce(false);
    await expect(
      client.compliance.getComplianceStatus(address),
    ).resolves.toMatchObject({
      status: 'not-approved',
      code: 'WHITELIST_NOT_APPROVED',
      eligible: false,
    });

    read.mockResolvedValueOnce(null);
    await expect(
      client.compliance.getComplianceStatus(address),
    ).resolves.toMatchObject({
      status: 'unavailable',
      code: 'READ_UNAVAILABLE',
      eligible: null,
    });
  });

  it('maps thrown read failures to unavailable without exposing provider details', async () => {
    const client = makeClient();
    const address = Keypair.random().publicKey();
    jest
      .spyOn(client.compliance as any, 'readWhitelist')
      .mockRejectedValue(new Error('opaque-provider-detail'));

    const status = await client.compliance.getComplianceStatus(address);

    expect(status).toMatchObject({
      status: 'unavailable',
      code: 'READ_UNAVAILABLE',
      eligible: null,
    });
    expect(JSON.stringify(status)).not.toContain('opaque-provider-detail');
  });

  it('requires a signer before the explicitly gated admin update path', async () => {
    const client = makeClient();
    const address = Keypair.random().publicKey();

    await expect(
      client.compliance.updateWhitelist(address, true),
    ).rejects.toMatchObject({
      name: 'ComplianceLifecycleError',
      code: 'SIGNER_REQUIRED',
      operation: 'admin-update',
    });
  });

  it('reports the missing contract write ABI after signer validation', async () => {
    const client = makeClient(Keypair.random());
    const address = Keypair.random().publicKey();

    await expect(
      client.compliance.updateWhitelist(address, false),
    ).rejects.toMatchObject({
      name: 'ComplianceLifecycleError',
      code: 'ADMIN_UPDATE_UNSUPPORTED',
      operation: 'admin-update',
    });
  });

  it('diagnoses lifecycle capability without serializing signer material', () => {
    const signer = Keypair.random();
    const client = makeClient(signer);
    const diagnostic = client.compliance.diagnoseLifecycle();
    const serialized = JSON.stringify(diagnostic);

    expect(diagnostic).toEqual({
      module: 'available',
      read: {
        supported: true,
        contractMethod: 'is_whitelisted',
      },
      adminUpdate: {
        supported: false,
        requiresSigner: true,
        reasonCode: 'CONTRACT_WRITE_METHOD_UNAVAILABLE',
      },
      signerConfigured: true,
      legalStatus: 'not-assessed',
    });
    expect(serialized).not.toContain(signer.publicKey());
    expect(serialized).not.toContain(signer.secret());
  });

  it('exports ComplianceLifecycleError for typed caller handling', () => {
    const error = new ComplianceLifecycleError(
      'ADMIN_UPDATE_UNSUPPORTED',
      'admin-update',
      'unsupported',
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('ADMIN_UPDATE_UNSUPPORTED');
  });
});
