import { Keypair, Networks } from '@stellar/stellar-sdk';
import { AegisClient } from '../src/client';
import { MintReadinessError } from '../src/errors/mint-readiness';
import { MintReadinessProbes } from '../src/types/mint-readiness';

describe('AssetModule mint readiness', () => {
  const contractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

  const makeClient = (withSigner = true) =>
    new AegisClient({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: Networks.TESTNET,
      contractId,
      keypair: withSigner ? Keypair.random() : undefined,
    });

  const passingProbes = (): MintReadinessProbes => ({
    issuerAuthorized: async () => true,
    assetActive: async () => true,
    networkReady: async () => true,
  });

  it('passes all five checks when authoritative reads approve the mint', async () => {
    const client = makeClient();
    const recipient = Keypair.random().publicKey();
    jest.spyOn(client.compliance, 'checkWhitelist').mockResolvedValue(true);
    jest
      .spyOn(client.rpcServer, 'getHealth')
      .mockResolvedValue({ status: 'healthy' } as any);

    const result = await client.asset.checkMintReadiness(recipient, 1000, {
      issuerAuthorized: async () => true,
      assetActive: async () => true,
    });

    expect(result.ready).toBe(true);
    expect(result.blockingCodes).toEqual([]);
    expect(Object.values(result.checks).every((check) => check.status === 'passed')).toBe(true);
    expect(client.rpcServer.getHealth).toHaveBeenCalledTimes(1);
  });

  it('fails closed when issuer and asset authority probes are unavailable', async () => {
    const client = makeClient();
    const recipient = Keypair.random().publicKey();
    jest.spyOn(client.compliance, 'checkWhitelist').mockResolvedValue(true);

    const result = await client.asset.checkMintReadiness(recipient, 1000, {
      networkReady: async () => true,
    });

    expect(result.ready).toBe(false);
    expect(result.checks.issuer.status).toBe('unknown');
    expect(result.checks.asset.status).toBe('unknown');
    expect(result.blockingCodes).toEqual(
      expect.arrayContaining([
        'ISSUER_AUTHORIZATION_UNAVAILABLE',
        'ASSET_STATUS_UNAVAILABLE',
      ]),
    );
  });

  it('returns a typed recipient blocker for a non-compliant account', async () => {
    const client = makeClient();
    const recipient = Keypair.random().publicKey();
    jest.spyOn(client.compliance, 'checkWhitelist').mockResolvedValue(false);

    const result = await client.asset.checkMintReadiness(
      recipient,
      1000,
      passingProbes(),
    );

    expect(result.ready).toBe(false);
    expect(result.checks.recipient.status).toBe('blocked');
    expect(result.checks.recipient.code).toBe('RECIPIENT_NOT_WHITELISTED');
  });

  it('reports recipient compliance read failures as typed errors', async () => {
    const client = makeClient();
    const recipient = Keypair.random().publicKey();
    jest
      .spyOn(client.rpcServer, 'simulateTransaction')
      .mockResolvedValue({ error: 'simulation failed' } as any);

    const result = await client.asset.checkMintReadiness(
      recipient,
      1000,
      passingProbes(),
    );

    expect(result.ready).toBe(false);
    expect(result.checks.recipient.status).toBe('error');
    expect(result.checks.recipient.code).toBe('RECIPIENT_COMPLIANCE_QUERY_FAILED');
    expect(result.checks.recipient.verified).toBe(false);
  });

  it('reports invalid amount and unhealthy network as separate blockers', async () => {
    const client = makeClient();
    const recipient = Keypair.random().publicKey();
    jest.spyOn(client.compliance, 'checkWhitelist').mockResolvedValue(true);

    const result = await client.asset.checkMintReadiness(recipient, 0, {
      issuerAuthorized: async () => true,
      assetActive: async () => true,
      networkReady: async () => false,
    });

    expect(result.ready).toBe(false);
    expect(result.checks.amount.code).toBe('INVALID_AMOUNT');
    expect(result.checks.network.code).toBe('NETWORK_UNHEALTHY');
  });

  it('blocks before low-level mint construction when readiness fails', async () => {
    const client = makeClient();
    const recipient = Keypair.random().publicKey();
    jest.spyOn(client.compliance, 'checkWhitelist').mockResolvedValue(false);
    const mint = jest.spyOn(client.asset, 'mint').mockResolvedValue('tx-hash');

    await expect(
      client.asset.mintWhenReady(recipient, 1000, passingProbes()),
    ).rejects.toBeInstanceOf(MintReadinessError);
    expect(mint).not.toHaveBeenCalled();
  });

  it('delegates to low-level mint only after a fresh passing assessment', async () => {
    const client = makeClient();
    const recipient = Keypair.random().publicKey();
    jest.spyOn(client.compliance, 'checkWhitelist').mockResolvedValue(true);
    const mint = jest.spyOn(client.asset, 'mint').mockResolvedValue('tx-hash');

    await expect(
      client.asset.mintWhenReady(recipient, 1000, passingProbes()),
    ).resolves.toBe('tx-hash');
    expect(mint).toHaveBeenCalledWith(recipient, 1000);
  });
});
